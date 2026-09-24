export type ProviderUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
};

export type UsageTotals = ProviderUsage & {
  costUsd: number | null;
};

const MODEL_PRICES: Record<string, [number, number, number, number]> = {
  "gpt-4o": [2.5, 10, 1.25, 2.5],
  "gpt-4o-mini": [0.15, 0.6, 0.075, 0.15],
};

export function calculateUsage(
  events: ProviderUsage[],
  model: string,
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
  const prices = MODEL_PRICES[model.split("/").at(-1) ?? model];
  return {
    ...totals,
    costUsd: prices
      ? (totals.inputTokens * prices[0] +
          totals.outputTokens * prices[1] +
          totals.cacheReadTokens * prices[2] +
          totals.cacheCreationTokens * prices[3]) /
        1_000_000
      : null,
  };
}
