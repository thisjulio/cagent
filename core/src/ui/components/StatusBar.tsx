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
  const variantText = variant ? ` (${variant})` : "";
  const MAX_MODEL_LABEL = 40 - variantText.length;
  let modelLabel = model;
  if (modelLabel.length > MAX_MODEL_LABEL) {
    modelLabel = `${modelLabel.slice(0, MAX_MODEL_LABEL - 3)}…`;
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
      <box flexDirection="row" alignItems="center" flexGrow={1}>
        <text fg="#666666">{modelLabel}</text>
        {variant && <text fg="#666666"> ({variant})</text>}
      </box>
      <text fg="#666666">
        {tokenInfo} [{meter}] {pct}% context · /help
      </text>
    </box>
  );
}
