import type { ProviderAdapter, ToolDefinition } from "@cagent/sdk";
import type { Message } from "@cagent/sdk";
import { splitRoute } from "../route";
import { estimateTokens as estimateTokensFallback } from "../session";

export function estimateForModel(adapter: ProviderAdapter, model: string, messages: Message[], tools: ToolDefinition[] = []): number {
  const modelName = splitRoute(model)[1];
  return adapter.estimate_tokens?.(modelName, messages, tools) ?? estimateTokensFallback(messages);
}
