import type { LlmCallOptions, Message, ProviderAdapter, ToolArgs, ToolDefinition } from "@cagent/sdk";
import type { EventBus } from "./events";
import { runToolPipeline, type ToolAsk } from "./tools";

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
): Promise<{ text: string; toolCalls: { id: string; name: string; arguments: string }[] }> {
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
      const toolCalls: { id: string; name: string; arguments: string }[] = [];
      for await (const chunk of opts.adapter.stream(request)) {
        if (opts.interrupted?.()) break;
        if (chunk.type === "text") {
          text += chunk.text;
          opts.onText?.(chunk.text);
        } else if (chunk.type === "reasoning") {
          opts.onReasoning?.(chunk.text);
        } else if (chunk.type === "tool-call") {
          toolCalls.push(chunk.tool_call);
        }
      }
      return { text, toolCalls };
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
}

export async function runTurn(opts: TurnOpts): Promise<{ records: TurnRecord[]; interrupted: boolean }> {
  const { messages, tools, allowlist, ask, bus } = opts;
  const records: TurnRecord[] = [];
  for (;;) {
    const { text, toolCalls } = await streamOnce(opts);
    const assistant: Message = {
      role: "assistant",
      content: text,
      ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
    };
    messages.push(assistant);
    records.push({ role: "assistant", content: text, tool_calls: toolCalls.length ? toolCalls : undefined });
    if (!toolCalls.length || opts.interrupted?.()) break;
    for (const tc of toolCalls) {
      const tool = tools.find((t) => t.name === tc.name);
      let args: ToolArgs = {};
      try {
        args = JSON.parse(tc.arguments) as ToolArgs;
      } catch {
        // args inválidos → vazio
      }
      const result = tool
        ? await runToolPipeline(tool, args, allowlist, ask, bus)
        : { output: `tool não encontrada: ${tc.name}`, isError: true };
      const msg: Message = { role: "tool", tool_call_id: tc.id, content: result.output };
      messages.push(msg);
      records.push({
        role: "tool",
        tool_call_id: tc.id,
        content: result.output,
        toolName: tool?.name ?? tc.name,
        args,
        isError: result.isError,
      });
      if (opts.interrupted?.()) break;
    }
  }
  return { records, interrupted: opts.interrupted?.() ?? false };
}
