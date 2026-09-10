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

export type Message = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: { id: string; name: string; arguments: string }[];
  tool_call_id?: string;
};

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
