import type { Message } from "./messages";
import type { ToolDefinition, ToolOverrides } from "./tools";

export type LlmChunk =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | {
      type: "tool-call";
      tool_call: {
        id: string;
        name: string;
        arguments: string;
        title?: string;
      };
    }
  | {
      type: "finish";
      finish_reason: string;
      usage?: {
        input_tokens: number;
        output_tokens: number;
        cache_read_tokens?: number;
        cache_creation_tokens?: number;
        time_to_first_token_ms?: number;
        tokens_per_second?: number;
        prompt_tokens_cached?: number;
        prompt_ms?: number;
        predicted_ms?: number;
        prompt_n?: number;
        predicted_n?: number;
        cache_n?: number;
      };
    };

export interface LlmCallOptions {
  model: string;
  messages: Message[];
  tools: ToolDefinition[];
  variant?: string;
}

export interface ProviderAdapter {
  list_models(): Promise<string[]>;
  context_window?(model: string): Promise<number | undefined>;
  supported_variants?(model: string): Promise<string[]>;
  tool_overrides?(): ToolOverrides;
  prepare_call(options: LlmCallOptions): Promise<LlmCallOptions>;
  stream(request: LlmCallOptions): AsyncGenerator<LlmChunk>;
  estimate_tokens?(model: string, messages: Message[]): number | undefined;
}
