export type ProviderUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  timeToFirstTokenMs?: number;
  tokensPerSecond?: number;
  promptTokensCached?: number;
};

export type UsageTotals = ProviderUsage & {
  costUsd: number | null;
};

export type ModelPrice = [number, number, number, number];

export const DEFAULT_MODEL_PRICES: Record<string, ModelPrice> = {
  "gpt-4o": [2.5, 10, 1.25, 2.5],
  "gpt-4o-mini": [0.15, 0.6, 0.075, 0.15],
  "gpt-4.1": [2, 8, 0.5, 2],
  "gpt-4.1-mini": [0.4, 1.6, 0.1, 0.4],
  "gpt-4.1-nano": [0.1, 0.4, 0.025, 0.1],
  o3: [2, 8, 0.5, 2],
  o4: [2, 8, 0.5, 2],
  "o4-mini": [1.1, 4.4, 0.275, 1.1],
  "claude-sonnet-4": [3, 15, 0.3, 3.75],
  "claude-3-7-sonnet": [3, 15, 0.3, 3.75],
  "claude-3-5-sonnet": [3, 15, 0.3, 3.75],
};

export function modelPrices(
  configured?: Record<string, ModelPrice>,
): Record<string, ModelPrice> {
  return { ...DEFAULT_MODEL_PRICES, ...configured };
}

export function calculateUsage(
  events: ProviderUsage[],
  model: string,
  configuredPrices?: Record<string, ModelPrice>,
): UsageTotals {
  const totals = events.reduce(
    (sum, item) => ({
      inputTokens: sum.inputTokens + item.inputTokens,
      outputTokens: sum.outputTokens + item.outputTokens,
      cacheReadTokens: sum.cacheReadTokens + item.cacheReadTokens,
      cacheCreationTokens: sum.cacheCreationTokens + item.cacheCreationTokens,
    }),
    {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    },
  );
  const prices =
    modelPrices(configuredPrices)[model.split("/").at(-1) ?? model];
  return {
    ...totals,
    costUsd: prices
      ? (Math.max(0, totals.inputTokens - totals.cacheReadTokens) * prices[0] +
          totals.outputTokens * prices[1] +
          totals.cacheReadTokens * prices[2] +
          totals.cacheCreationTokens * prices[3]) /
        1_000_000
      : null,
  };
}

export function canDisplayCost(model: string, provider: string): boolean {
  const route = model.includes("/") ? model.split("/")[0] : provider;
  return route !== "codex" && route !== "llama.cpp" && route !== "ollama";
}
