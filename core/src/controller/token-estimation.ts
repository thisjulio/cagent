import type { ProviderAdapter } from "@cagent/sdk";
import type { Message } from "@cagent/sdk";
import { splitRoute } from "../route";
import { estimateTokens as estimateTokensFallback } from "../session";

export function estimateForModel(adapter: ProviderAdapter, model: string, messages: Message[]): number {
  const modelName = splitRoute(model)[1];
  return adapter.estimate_tokens?.(modelName, messages) ?? estimateTokensFallback(messages);
}
