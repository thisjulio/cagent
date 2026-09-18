export function StatusBar({
  model,
  variant,
  tokens,
  inputTokens,
  outputTokens,
  contextWindow,
  threshold,
}: {
  model: string;
  variant?: string;
  tokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  contextWindow: number;
  threshold: number;
}) {
  const MAX_MODEL_LABEL = 40;
  let label = variant ? `${model} (${variant})` : model;
  if (label.length > MAX_MODEL_LABEL) {
    label = `${label.slice(0, MAX_MODEL_LABEL - 3)}…`;
  }
  const pct =
    tokens !== undefined && contextWindow
      ? Math.round((tokens / contextWindow) * 100)
      : 0;
  const filled = Math.min(20, Math.round((pct / 100) * 20));
  const meter = `${"=".repeat(filled)}${"-".repeat(20 - filled)}`;
  const tokenInfo =
    tokens !== undefined ? `${tokens}/${contextWindow}` : "no usage yet";
  return (
    <box
      border={["top"]}
      borderColor="#666666"
      height={2}
      flexShrink={0}
      flexDirection="row"
      justifyContent="space-between"
    >
      <text fg="#666666">{label}</text>
      <text fg="#666666">
        {tokenInfo} [{meter}] {pct}% context · /help
      </text>
    </box>
  );
}
