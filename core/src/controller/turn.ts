import { noopObservability, type Message, type Observability, type ProviderAdapter, type ToolDefinition } from "@cagent/sdk";
import { runTurn, type TurnRecord } from "../loop";
import type { EventBus } from "../events";
import { estimateTokens, type Session } from "../session";
import type { ToolAsk } from "../tools";
import { appendChat } from "./chat-buffer";
import type { UIState } from "./state";
import { appendCapped, MAX_VISIBLE_STREAM_CHARS } from "../stream-buffer";
import type { Task } from "../tasks";

export type TurnHost = {
  state: UIState;
  adapter: ProviderAdapter;
  model: string;
  messages: Message[];
  tools: ToolDefinition[];
  allowlist: string[];
  ask: ToolAsk;
  bus: EventBus;
  hooks: { run(event: import("@cagent/sdk").HookEvent): Promise<import("@cagent/sdk").HookResponse[]> };
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
};

export async function executeTurn(host: TurnHost): Promise<void> {
  let thinkingContent = "";
  let streamedTokens = 0;
  try {
    let turn = await runAgentTurn(host, () => thinkingContent, (value) => { thinkingContent = value; }, () => streamedTokens, (value) => { streamedTokens = value; });
    let continuations = 0;
    let previousTasks = taskSignature(host.state.tasks);
    while (shouldContinueTasks(host.state.tasks, host.interrupted) && continuations < 2) {
      const currentTasks = taskSignature(host.state.tasks);
      if (continuations > 0 && currentTasks === previousTasks) break;
      host.messages.push({
        role: "user",
        content: "Checklist tasks remain unfinished. Continue with the next pending task. Mark exactly one task in_progress before using other tools. Do not summarize yet.",
      });
      turn = await runAgentTurn(host, () => thinkingContent, (value) => { thinkingContent = value; }, () => streamedTokens, (value) => { streamedTokens = value; });
      continuations++;
      previousTasks = currentTasks;
    }
    persistTurn(host, turn.records, thinkingContent);
    for (const item of host.state.chat) if (item.kind === "tool" && item.running) item.running = false;
    if (turn.inputTokens !== undefined) host.state.tokens = turn.inputTokens;
    host.state.notice = turn.interrupted ? "[interrupted - type to steer]" : "";
  } catch (error) {
    host.observability?.recordEvent("agent.turn.error", { "error.type": error instanceof Error ? error.name : "unknown" });
    host.state.notice = `error: ${error instanceof Error ? error.message : String(error)}`;
  }
  host.observability?.recordMetric("agent.turn.elapsed_ms", host.state.turnStartedAt ? Date.now() - host.state.turnStartedAt : 0);
  host.state.busy = false;
  host.state.elapsedMs = host.state.turnStartedAt ? Date.now() - host.state.turnStartedAt : 0;
  host.state.turnStartedAt = null;
  host.state.tokens = estimateTokens(host.messages);
  host.bump();
}

async function runAgentTurn(
  host: TurnHost,
  getThinking: () => string,
  setThinking: (value: string) => void,
  getTokens: () => number,
  setTokens: (value: number) => void,
) {
  return runTurn({
    adapter: host.adapter, model: host.model, messages: host.messages, tools: host.tools,
    allowlist: host.allowlist, ask: host.ask, bus: host.bus, hooks: host.hooks, signal: host.signal,
    onText: (text) => {
      appendText(host, text);
      setTokens(getTokens() + Math.ceil(text.length / 4));
      host.state.tokens = estimateTokens(host.messages) + getTokens();
      host.bumpStream(); host.onText?.(text);
    },
    onReasoning: (text) => {
      setThinking(appendCapped(getThinking(), text, MAX_VISIBLE_STREAM_CHARS));
      appendReasoning(host, text);
      setTokens(getTokens() + Math.ceil(text.length / 4));
      host.state.tokens = estimateTokens(host.messages) + getTokens();
      host.bumpStream(); host.onReasoning?.(text);
    },
    interrupted: host.interrupted, maxTurns: host.maxTurns, maxToolCalls: host.maxToolCalls,
    observability: host.observability ?? noopObservability,
    traceAttributes: host.traceAttributes,
  });
}

function taskSignature(tasks: Task[]): string {
  return tasks.map((task) => `${task.id}:${task.status}:${task.evidence ?? ""}`).join("|");
}

function shouldContinueTasks(tasks: Task[], interrupted: () => boolean): boolean {
  return !interrupted() && tasks.length > 0 &&
    tasks.some((task) => task.status === "pending") &&
    !tasks.some((task) => task.status === "blocked");
}

function appendText(host: TurnHost, text: string): void {
  const last = host.state.chat[host.state.chat.length - 1];
  if (last.kind === "assistant") last.content = appendCapped(last.content, text, MAX_VISIBLE_STREAM_CHARS);
  else appendChat(host.state, { kind: "assistant", content: appendCapped("", text, MAX_VISIBLE_STREAM_CHARS) });
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

function persistTurn(host: TurnHost, records: TurnRecord[], thinking: string): void {
  if (thinking) host.session.append({ ts: Date.now(), type: "thinking", payload: { content: thinking } });
  for (const record of records) {
    if (record.role === "assistant") {
      host.session.append({ ts: Date.now(), type: "assistant", payload: { content: record.content, ...(record.tool_calls ? { tool_calls: record.tool_calls } : {}) } });
    } else {
      host.session.append({ ts: Date.now(), type: "tool", payload: { tool_call_id: record.tool_call_id, content: record.content, isError: record.isError, toolName: record.toolName } });
    }
  }
}