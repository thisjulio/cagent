export function StatusBar({
  model,
  variant,
  tokens,
  tokensPerSecond,
  inputTokens,
  outputTokens,
  contextWindow,
  threshold,
  permissionMode,
  permissionsEnabled,
  missingLspLanguages = [],
  onOpenLsp,
}: {
  model: string;
  variant?: string;
  tokens?: number;
  tokensPerSecond?: number;
  inputTokens?: number;
  outputTokens?: number;
  contextWindow: number;
  threshold: number;
  permissionMode: "ask" | "auto" | "read-only";
  permissionsEnabled: boolean;
  missingLspLanguages?: string[];
  onOpenLsp?: () => void;
}) {
  const variantText = variant ? ` (${variant})` : "";
  const MAX_MODEL_LABEL = 40 - variantText.length;
  let modelLabel = model;
  if (modelLabel.length > MAX_MODEL_LABEL) {
    modelLabel = `${modelLabel.slice(0, MAX_MODEL_LABEL - 3)}…`;
  }
  const usagePct =
    tokens !== undefined && contextWindow ? (tokens / contextWindow) * 100 : 0;
  const thresholdPct = contextWindow ? (threshold / contextWindow) * 100 : 0;
  const pct = Math.round(usagePct);
  const filled = Math.min(20, Math.round((usagePct / 100) * 20));
  const meter = `${"█".repeat(filled)}${"-".repeat(20 - filled)}`;
  const tokenInfo =
    tokens !== undefined
      ? `${formatTokens(tokens)}/${formatTokens(contextWindow)}`
      : "no usage yet";
  const usageColor =
    usagePct >= thresholdPct
      ? "#ef4444"
      : usagePct >= thresholdPct * 0.85
        ? "#eab308"
        : "#666666";
  const modeLabel = permissionsEnabled
    ? `mode: ${permissionMode}`
    : "mode: auto (permissions disabled)";
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
        <text fg="#777777">{modeLabel} </text>
        {missingLspLanguages.length > 0 && (
          <text fg="#d97757">⚠ lsp:{missingLspLanguages.join(",")} </text>
        )}
        <text fg="#666666">{modelLabel}</text>
        {variant && <text fg="#666666"> ({variant})</text>}
      </box>
      <box flexDirection="row">
        <text fg={usageColor}>
          {tokenInfo} [{meter}] {pct}% context
          {tokensPerSecond !== undefined
            ? ` · ${tokensPerSecond.toFixed(1)} tok/s`
            : ""}{" "}
          · /help
        </text>
      </box>
    </box>
  );
}

function formatTokens(tokens: number): string {
  if (tokens < 1000) return String(tokens);
  const value = tokens / 1000;
  return `${Number.isInteger(value) ? value : value.toFixed(1)}k`;
}
