export type ToolArgs = Record<string, unknown>;

export interface ToolResult {
  output: string;
  isError?: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: ToolArgs) => Promise<ToolResult>;
}

export function defineTool(
  name: string,
  description: string,
  parameters: Record<string, unknown>,
  execute: (args: ToolArgs) => Promise<ToolResult>,
): ToolDefinition {
  return { name, description, parameters, execute };
}

// Provider-declared schema override: same canonical name, schema changed to the
// model family's native format. The canonical name (map key) remains valid for
// the UI, logs, and metrics.
export type ToolSchemaOverride = {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
};

export type ToolOverrides = Record<string, ToolSchemaOverride>;

export function applyToolOverrides(tools: ToolDefinition[], overrides: ToolOverrides): ToolDefinition[] {
  return tools.map((t) => {
    const ov = overrides[t.name];
    return ov
      ? { ...t, name: ov.name, description: ov.description ?? t.description, parameters: ov.parameters ?? t.parameters }
      : t;
  });
}

export function overrideNameMap(overrides: ToolOverrides): Record<string, string> {
  const map: Record<string, string> = {};
  for (const [canonical, ov] of Object.entries(overrides)) map[ov.name] = canonical;
  return map;
}

export type Message = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: { id: string; name: string; arguments: string }[];
  tool_call_id?: string;
};

export type WireMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
};

// Chat completions wire format (assistant: tool_calls with type/function; tool: tool_call_id).
export function toChatMessages(messages: Message[]): WireMessage[] {
  return messages.map((m) => {
    const out: WireMessage = { role: m.role, content: m.content };
    if (m.tool_call_id) out.tool_call_id = m.tool_call_id;
    if (m.tool_calls?.length) {
      out.tool_calls = m.tool_calls.map((tc) => ({
        id: tc.id,
        type: "function",
        function: { name: tc.name, arguments: tc.arguments },
      }));
    }
    return out;
  });
}

export type LlmChunk =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "tool-call"; tool_call: { id: string; name: string; arguments: string } }
  | { type: "finish"; finish_reason: string; usage?: { input_tokens: number; output_tokens: number } };

export interface LlmCallOptions {
  model: string;
  messages: Message[];
  tools: ToolDefinition[];
}

export interface ProviderAdapter {
  list_models(): Promise<string[]>;
  context_window?(model: string): Promise<number | undefined>;
  estimate_tokens?(model: string, messages: Message[]): number | undefined;
  tool_overrides?(): ToolOverrides;
  prepare_call(options: LlmCallOptions): Promise<LlmCallOptions>;
  stream(request: LlmCallOptions): AsyncGenerator<LlmChunk>;
}

export interface PluginContext {
  name: string;
  config: Record<string, unknown>;
  registerTool(tool: ToolDefinition): void;
  registerProvider(route: string, adapter: ProviderAdapter): void;
  emit(event: string, payload: unknown): void;
  on(event: string, handler: (payload: unknown) => unknown): void;
  promptSection(name: string, content: string): void;
}

export type Plugin = (ctx: PluginContext) => void | Promise<void>;
