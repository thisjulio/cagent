import { applyToolOverrides, noopObservability, overrideNameMap, trace, type LlmCallOptions, type Message, type Observability, type ProviderAdapter, type ToolArgs, type ToolDefinition, type ToolEvidence, type WorkflowEventPayload } from "@cagent/sdk";
import type { EventBus } from "./events";
import { runToolPipeline, type ToolAsk } from "./tools";
import { appendCapped, MAX_RESPONSE_CHARS } from "./stream-buffer";

export interface StreamOpts {
  adapter: ProviderAdapter;
  model: string;
  variant?: string;
  messages: Message[];
  tools: ToolDefinition[];
  onText?: (text: string) => void;
  onReasoning?: (text: string) => void;
  onToolOutput?: (content: string) => void;
  onUsage?: (usage: { inputTokens?: number; outputTokens?: number }) => void;
  interrupted?: () => boolean;
  attempts?: number;
  observability?: Observability;
  traceAttributes?: Record<string, string | number | boolean>;
}

export async function streamOnce(
  opts: StreamOpts,
): Promise<{ text: string; toolCalls: { id: string; name: string; arguments: string }[]; inputTokens?: number }> {
  const attempts = opts.attempts ?? 3;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const observability = opts.observability ?? noopObservability;
      const request: LlmCallOptions = await trace(observability, "provider.prepare_call", () => opts.adapter.prepare_call({
        model: opts.model,
        variant: opts.variant,
        messages: opts.messages,
        tools: opts.tools,
      }), { "provider.model": opts.model, ...opts.traceAttributes });
      let text = "";
      let inputTokens: number | undefined;
      let chunks = 0;
      let outputChars = 0;
      let firstTokenAt: number | undefined;
      const streamStartedAt = performance.now();
      const toolCalls: { id: string; name: string; arguments: string }[] = [];
      const streamSpan = observability.startSpan("provider.stream", { "provider.model": opts.model, ...opts.traceAttributes });
      for await (const chunk of opts.adapter.stream(request)) {
        chunks++;
        firstTokenAt ??= performance.now();
        if (chunk.type === "finish") {
          inputTokens = chunk.usage?.input_tokens;
          opts.onUsage?.({ inputTokens: chunk.usage?.input_tokens, outputTokens: chunk.usage?.output_tokens });
        }
        if (opts.interrupted?.()) break;
        if (chunk.type === "text") {
          text = appendCapped(text, chunk.text, MAX_RESPONSE_CHARS);
          outputChars += chunk.text.length;
          opts.onText?.(chunk.text);
        } else if (chunk.type === "reasoning") {
          opts.onReasoning?.(chunk.text);
        } else if (chunk.type === "tool-call") {
          toolCalls.push(chunk.tool_call);
        }
      }
      streamSpan.setAttribute("provider.stream.chunks", chunks);
      streamSpan.setAttribute("provider.stream.output_chars", outputChars);
      if (firstTokenAt !== undefined) streamSpan.setAttribute("provider.stream.time_to_first_chunk_ms", firstTokenAt - streamStartedAt);
      streamSpan.end();
      return { text, toolCalls, inputTokens };
    } catch (e) {
      (opts.observability ?? noopObservability).recordEvent("provider.error", { "provider.model": opts.model });
      lastErr = e;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
    }
  }
  throw lastErr;
}

export interface TurnRecord {
  role: "assistant" | "tool";
  content: string;
  tool_calls?: Message["tool_calls"];
  tool_call_id?: string;
  toolName?: string;
  args?: ToolArgs;
  isError?: boolean;
}

export interface TurnOpts extends StreamOpts {
  allowlist: string[];
  ask: ToolAsk;
  bus: EventBus;
  hooks?: { run(event: import("@cagent/sdk").HookEvent): Promise<import("@cagent/sdk").HookResponse[]> };
  signal?: AbortSignal;
  maxTurns?: number;
  maxToolCalls?: number;
  observability?: Observability;
  traceAttributes?: Record<string, string | number | boolean>;
}

interface ToolLoopCtx {
  opts: TurnOpts;
  nameToCanonical: Record<string, string>;
  records: TurnRecord[];
  evidence: ToolEvidence[];
}

async function runToolCall(ctx: ToolLoopCtx, tc: { id: string; name: string; arguments: string }): Promise<void> {
  const { opts } = ctx;
  const tool = opts.tools.find((t) => t.name === (ctx.nameToCanonical[tc.name] ?? tc.name));
  let args: ToolArgs = {};
  try {
    args = JSON.parse(tc.arguments) as ToolArgs;
  } catch {
    // Custom/freeform tools return their payload directly instead of JSON.
    if (tool?.name === "edit_file" && tc.name === "apply_patch") args = { patch: tc.arguments };
  }
  const result = tool
    ? await runToolPipeline(tool, args, opts.allowlist, opts.ask, opts.bus, opts.hooks, opts.signal, opts.observability)
    : { output: `tool not found: ${tc.name}`, isError: true };
  opts.messages.push({ role: "tool", tool_call_id: tc.id, content: result.output });
  ctx.records.push({
    role: "tool",
    tool_call_id: tc.id,
    content: result.output,
    toolName: tool?.name ?? tc.name,
    args,
    isError: result.isError,
  });
  opts.onToolOutput?.(result.output);
  ctx.evidence.push(...(result.evidence ?? []));
  opts.bus.emit("tool.completed", workflowPayload(opts, {
    tool: tool?.name ?? tc.name,
    content: result.output.slice(0, 4000),
    isError: result.isError === true,
    evidence: result.evidence,
  }));
}

export type TurnResult = { records: TurnRecord[]; interrupted: boolean; inputTokens?: number };

export async function runTurn(opts: TurnOpts): Promise<TurnResult> {
  // ponytail: the override belongs to the provider surface; the registry keeps the canonical name.
  const overrides = opts.adapter.tool_overrides?.() ?? {};
  const nameToCanonical = overrideNameMap(overrides);
  const streamOpts: StreamOpts = { ...opts, tools: applyToolOverrides(opts.tools, overrides) };
  const records: TurnRecord[] = [];
  let inputTokens: number | undefined;
  const ctx: ToolLoopCtx = { opts, nameToCanonical, records, evidence: [] };
  let turns = 0;
  let toolCalls = 0;
  const observability = opts.observability ?? noopObservability;
  return trace(observability, "agent.turn", async () => {
  for (;;) {
    if (++turns > (opts.maxTurns ?? Infinity)) throw new Error("maximum turns exceeded");
    opts.bus.emit("prompt.assembling", workflowPayload(opts, { query: lastUserMessage(opts.messages) }));
    const result = await streamOnce(streamOpts);
    const { text, toolCalls: streamedToolCalls } = result;
    inputTokens = result.inputTokens ?? inputTokens;
    const assistant: Message = {
      role: "assistant",
      content: text,
      ...(streamedToolCalls.length ? { tool_calls: streamedToolCalls } : {}),
    };
    opts.messages.push(assistant);
    records.push({ role: "assistant", content: text, tool_calls: streamedToolCalls.length ? streamedToolCalls : undefined });
    if (!streamedToolCalls.length || opts.interrupted?.()) break;
    for (const tc of streamedToolCalls) {
      if (++toolCalls > (opts.maxToolCalls ?? Infinity)) throw new Error("maximum tool calls exceeded");
      await runToolCall(ctx, tc);
      if (opts.interrupted?.()) break;
    }
  }
  opts.bus.emit("turn.completed", workflowPayload(opts, {
    content: [lastUserMessage(opts.messages), ...records.filter((record) => record.role === "assistant").map((record) => record.content)].filter(Boolean).join("\n"),
    toolContent: records.filter((record) => record.role === "tool" && !record.isError).map((record) => record.content).join("\n"),
    evidence: ctx.evidence,
  }));
  return { records, interrupted: opts.interrupted?.() ?? false, inputTokens };
  }, opts.traceAttributes);
}

function lastUserMessage(messages: Message[]): string {
  return [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
}

function workflowPayload(opts: TurnOpts, data: Record<string, unknown>): WorkflowEventPayload {
  return { version: 1, data };
}
