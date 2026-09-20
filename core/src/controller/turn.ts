import {
  noopObservability,
  type Message,
  type Observability,
  type ProviderAdapter,
  type ToolDefinition,
} from "@cagent/sdk";
import { runTurn, type TurnRecord } from "../loop";
import type { EventBus } from "../events";
import { type Session } from "../session/index";
import type { ToolAsk } from "../tools";
import { appendChat, notify } from "./chat-buffer";
import type { UIState } from "./state";
import { appendCapped, MAX_VISIBLE_STREAM_CHARS } from "../stream-buffer";
import type { VerificationRunner } from "../verification/runner";

export type TurnHost = {
  state: UIState;
  adapter: ProviderAdapter;
  model: string;
  variant?: string;
  messages: Message[];
  messagesForRequest?: (messages: Message[]) => Message[];
  tools: ToolDefinition[];
  allowlist: string[];
  ask: ToolAsk;
  bus: EventBus;
  hooks: {
    run(
      event: import("@cagent/sdk").HookEvent,
    ): Promise<import("@cagent/sdk").HookResponse[]>;
  };
  session: Session;
  interrupted: () => boolean;
  signal?: AbortSignal;
  bump: () => void;
  bumpStream: () => void;
  maxTurns?: number;
  maxToolCalls?: number;
  onText?: (text: string) => void;
  onReasoning?: (text: string) => void;
  observability?: Observability;
  traceAttributes?: Record<string, string | number | boolean>;
  onContextLimit?: () => Promise<void>;
  turnId?: string;
  verification?: VerificationRunner;
};

export async function executeTurn(host: TurnHost): Promise<void> {
  let thinkingContent = "";
  let streamedTokens = 0;
  try {
    let turn = await runAgentTurnWithRecovery(
      host,
      () => thinkingContent,
      (value) => {
        thinkingContent = value;
      },
      () => streamedTokens,
      (value) => {
        streamedTokens = value;
      },
    );
    const records = [...turn.records];
    persistTurn(host, records, thinkingContent);
    for (const item of host.state.chat)
      if (item.kind === "tool" && item.running) item.running = false;
    if (turn.inputTokens !== undefined && turn.outputTokens !== undefined) {
      host.state.tokens = turn.inputTokens + turn.outputTokens;
    }
    if (turn.interrupted) {
      notify(host.state, "[interrupted - type to steer]");
    } else {
      host.state.notice = "";
    }
  } catch (error) {
    host.observability?.recordEvent("agent.turn.error", {
      "error.type": error instanceof Error ? error.name : "unknown",
    });
    notify(
      host.state,
      `error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  host.observability?.recordMetric(
    "agent.turn.elapsed_ms",
    host.state.turnStartedAt ? Date.now() - host.state.turnStartedAt : 0,
  );
  host.state.busy = false;
  host.state.elapsedMs = host.state.turnStartedAt
    ? Date.now() - host.state.turnStartedAt
    : 0;
  host.state.turnStartedAt = null;
  host.bump();
}

async function runAgentTurnWithRecovery(
  host: TurnHost,
  getThinking: () => string,
  setThinking: (value: string) => void,
  getTokens: () => number,
  setTokens: (value: number) => void,
) {
  try {
    return await runAgentTurn(
      host,
      getThinking,
      setThinking,
      getTokens,
      setTokens,
    );
  } catch (error) {
    if (!host.onContextLimit || !isContextLimitError(error)) throw error;
    host.observability?.recordEvent("compaction.recovery", {
      reason: "provider_context_limit",
      error: error instanceof Error ? error.message : String(error),
      "state.tokens": host.state.tokens ?? 0,
      "context.window": host.state.contextWindow,
      threshold: host.state.threshold,
      model: host.model,
    });
    notify(host.state, "context limit reached; compacting context...");
    await host.onContextLimit();
    return await runAgentTurn(
      host,
      getThinking,
      setThinking,
      getTokens,
      setTokens,
    );
  }
}

function isContextLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /exceed_context_size|context size|context length|maximum context/i.test(
    message,
  );
}

async function runAgentTurn(
  host: TurnHost,
  getThinking: () => string,
  setThinking: (value: string) => void,
  getTokens: () => number,
  setTokens: (value: number) => void,
) {
  return runTurn({
    adapter: host.adapter,
    model: host.model,
    variant: host.variant,
    messages: host.messages,
    messagesForRequest: host.messagesForRequest,
    tools: host.tools,
    allowlist: host.allowlist,
    ask: host.ask,
    bus: host.bus,
    hooks: host.hooks,
    signal: host.signal,
    onText: (text) => {
      appendText(host, text);
      host.bumpStream();
      host.onText?.(text);
    },
    onReasoning: (text) => {
      setThinking(appendCapped(getThinking(), text, MAX_VISIBLE_STREAM_CHARS));
      appendReasoning(host, text);
      host.bumpStream();
      host.onReasoning?.(text);
    },
    interrupted: host.interrupted,
    maxTurns: host.maxTurns,
    maxToolCalls: host.maxToolCalls,
    observability: host.observability ?? noopObservability,
    traceAttributes: host.traceAttributes,
    verification: host.verification,
    onToolOutput: (content) => {
      host.bumpStream();
    },
    onUsage: (usage) => {
      if (usage.inputTokens !== undefined)
        host.state.inputTokens = usage.inputTokens;
      if (usage.outputTokens !== undefined)
        host.state.outputTokens = usage.outputTokens;
      if (usage.inputTokens !== undefined && usage.outputTokens !== undefined) {
        host.state.tokens = usage.inputTokens + usage.outputTokens;
      }
      host.bumpStream();
    },
  });
}

function appendText(host: TurnHost, text: string): void {
  const last = host.state.chat[host.state.chat.length - 1];
  if (last.kind === "assistant")
    last.content = appendCapped(last.content, text, MAX_VISIBLE_STREAM_CHARS);
  else
    appendChat(host.state, {
      kind: "assistant",
      content: appendCapped("", text, MAX_VISIBLE_STREAM_CHARS),
    });
  host.bumpStream();
}

function appendReasoning(host: TurnHost, text: string): void {
  const last = host.state.chat[host.state.chat.length - 1];
  if (last?.kind === "thinking") {
    last.content = appendCapped(last.content, text, MAX_VISIBLE_STREAM_CHARS);
  } else {
    appendChat(host.state, {
      kind: "thinking",
      content: appendCapped("", text, MAX_VISIBLE_STREAM_CHARS),
    });
  }
  host.bumpStream();
}

function persistTurn(
  host: TurnHost,
  records: TurnRecord[],
  thinking: string,
): void {
  if (thinking)
    host.session.append({
      ts: Date.now(),
      turnId: host.turnId,
      type: "thinking",
      payload: { content: thinking },
    });
  for (const record of records) {
    if (record.role === "assistant") {
      host.session.append({
        ts: Date.now(),
        turnId: host.turnId,
        type: "assistant",
        payload: {
          content: record.content,
          ...(record.tool_calls ? { tool_calls: record.tool_calls } : {}),
        },
      });
    } else {
      host.session.append({
        ts: Date.now(),
        turnId: host.turnId,
        type: "tool",
        payload: {
          tool_call_id: record.tool_call_id,
          content: record.content,
          isError: record.isError,
          toolName: record.toolName,
          display: record.display,
        },
      });
    }
  }
  if (host.state.tokens !== undefined) {
    host.session.append({
      ts: Date.now(),
      turnId: host.turnId,
      type: "meta",
      payload: {
        kind: "usage",
        tokens: host.state.tokens,
        inputTokens: host.state.inputTokens,
        outputTokens: host.state.outputTokens,
      },
    });
  }
}
