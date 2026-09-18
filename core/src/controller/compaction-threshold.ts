import type { AppConfig } from "../config";

export function compactionThreshold(
  contextWindow: number,
  config: AppConfig,
): number {
  if (config.compact_threshold_tokens !== undefined) {
    return config.compact_threshold_tokens;
  }
  const configuredPercent = config.compact_threshold_percent ?? 80;
  const percent = Math.min(100, Math.max(1, configuredPercent));
  return Math.floor((contextWindow * percent) / 100);
}
