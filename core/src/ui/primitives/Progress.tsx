import { Text } from "./Text";

export function Progress({
  value,
  maximum,
  width = 10,
}: {
  value: number;
  maximum: number;
  width?: number;
}) {
  const ratio = maximum > 0 ? Math.max(0, Math.min(1, value / maximum)) : 0;
  const filled = Math.round(ratio * width);
  return (
    <Text tone={ratio >= 0.9 ? "danger" : ratio >= 0.8 ? "warning" : "accent"}>
      {"█".repeat(filled)}
      {"░".repeat(width - filled)}
    </Text>
  );
}
