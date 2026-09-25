import { formatCwd, formatGitBadge, getGitInfo } from "../../gitinfo";

export function StatusBar({
  cwd,
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
  cwd: string;
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
  const pct = Math.round(usagePct);
  const filled = Math.min(20, Math.round((usagePct / 100) * 20));
  const tokenInfo =
    tokens !== undefined
      ? `${formatTokens(tokens)}/${formatTokens(contextWindow)}`
      : "no usage yet";
  const modeLabel = permissionMode;
  const gitBadge = formatGitBadge(getGitInfo(cwd));
  return (
    <box border={["top"]} borderColor="#666666" height={3} flexShrink={0}>
      <box flexDirection="row" justifyContent="space-between" paddingX={1}>
        <box flexDirection="row">
          <text fg="#5ac878">{formatCwd(cwd)}</text>
          <text fg="#d97757">{gitBadge ? ` · ${gitBadge}` : ""}</text>
        </box>
        <box flexDirection="row">
          <text fg="#888888">⇧Tab</text>
          <text fg="#eab308"> {modeLabel}</text>
        </box>
      </box>
      <box flexDirection="row" justifyContent="space-between" paddingX={1}>
        <box flexDirection="row" flexShrink={1}>
          <text fg="#ffffff">{modelLabel}</text>
          {variant && <text fg="#ffffff"> ({variant})</text>}
          <text fg="#ffffff"> · {tokenInfo}</text>
          <text fg="#d97757">
            {" "}
            {"█".repeat(filled)}
            {"░".repeat(20 - filled)}
          </text>
          <text fg="#ffffff"> {pct}%</text>
        </box>
        <text fg="#888888">? ajuda</text>
      </box>
    </box>
  );
}

function formatTokens(tokens: number): string {
  if (tokens < 1000) return String(tokens);
  const value = tokens / 1000;
  return `${Number.isInteger(value) ? value : value.toFixed(1)}k`;
}
