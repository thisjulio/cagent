import { applyToolOverrides, overrideNameMap, type LlmCallOptions, type Message, type ProviderAdapter, type ToolArgs, type ToolDefinition } from "@cagent/sdk";
import type { EventBus } from "./events";
import { runToolPipeline, type ToolAsk } from "./tools";
import { appendCapped, MAX_RESPONSE_CHARS } from "./stream-buffer";

export interface StreamOpts {
  adapter: ProviderAdapter;
  model: string;
  messages: Message[];
  tools: ToolDefinition[];
  onText?: (text: string) => void;
  onReasoning?: (text: string) => void;
  interrupted?: () => boolean;
  attempts?: number;
}

export async function streamOnce(
  opts: StreamOpts,
): Promise<{ text: string; toolCalls: { id: string; name: string; arguments: string }[]; inputTokens?: number }> {
  const attempts = opts.attempts ?? 3;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const request: LlmCallOptions = await opts.adapter.prepare_call({
        model: opts.model,
        messages: opts.messages,
        tools: opts.tools,
      });
      let text = "";
      let inputTokens: number | undefined;
      const toolCalls: { id: string; name: string; arguments: string }[] = [];
      for await (const chunk of opts.adapter.stream(request)) {
        if (chunk.type === "finish") inputTokens = chunk.usage?.input_tokens;
        if (opts.interrupted?.()) break;
        if (chunk.type === "text") {
          text = appendCapped(text, chunk.text, MAX_RESPONSE_CHARS);
          opts.onText?.(chunk.text);
        } else if (chunk.type === "reasoning") {
          opts.onReasoning?.(chunk.text);
        } else if (chunk.type === "tool-call") {
          toolCalls.push(chunk.tool_call);
        }
      }
      return { text, toolCalls, inputTokens };
    } catch (e) {
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
}

interface ToolLoopCtx {
  opts: TurnOpts;
  nameToCanonical: Record<string, string>;
  records: TurnRecord[];
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
    ? await runToolPipeline(tool, args, opts.allowlist, opts.ask, opts.bus, opts.hooks, opts.signal)
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
}

export type TurnResult = { records: TurnRecord[]; interrupted: boolean; inputTokens?: number };

export async function runTurn(opts: TurnOpts): Promise<TurnResult> {
  // ponytail: the override belongs to the provider surface; the registry keeps the canonical name.
  const overrides = opts.adapter.tool_overrides?.() ?? {};
  const nameToCanonical = overrideNameMap(overrides);
  const streamOpts: StreamOpts = { ...opts, tools: applyToolOverrides(opts.tools, overrides) };
  const records: TurnRecord[] = [];
  let inputTokens: number | undefined;
  const ctx: ToolLoopCtx = { opts, nameToCanonical, records };
  let turns = 0;
  let toolCalls = 0;
  for (;;) {
    if (++turns > (opts.maxTurns ?? Infinity)) throw new Error("maximum turns exceeded");
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
  return { records, interrupted: opts.interrupted?.() ?? false, inputTokens };
}
