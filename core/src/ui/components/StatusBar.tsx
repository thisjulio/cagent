import { formatCwd, formatGitBadge, type GitInfo } from "../../gitinfo";
import { useTerminalDimensions } from "@opentui/react";
import { responsiveSize } from "../theme/breakpoints";
import { useTheme } from "../primitives/theme-context";
import { Progress } from "../primitives/Progress";
import { symbols } from "../theme/symbols";

export function StatusBar({
  cwd,
  gitInfo,
  model,
  variant,
  tokens,
  contextWindow,
  permissionMode,
  permissionsEnabled,
  missingLspLanguages = [],
}: {
  cwd: string;
  gitInfo: GitInfo;
  model: string;
  variant?: string;
  tokens?: number;
  contextWindow: number;
  permissionMode: "ask" | "auto" | "read-only";
  permissionsEnabled: boolean;
  missingLspLanguages?: string[];
}) {
  const dimensions = useTerminalDimensions();
  const { color } = useTheme();
  const variantText = variant ? ` (${variant})` : "";
  const MAX_MODEL_LABEL = 40 - variantText.length;
  let modelLabel = model;
  if (modelLabel.length > MAX_MODEL_LABEL) {
    modelLabel = `${modelLabel.slice(0, MAX_MODEL_LABEL - 3)}…`;
  }
  const usagePct =
    tokens !== undefined && contextWindow ? (tokens / contextWindow) * 100 : 0;
  const pct = Math.round(usagePct);
  const contextLevel =
    pct >= 90 ? "critical" : pct >= 80 ? "attention" : "neutral";
  const tokenInfo =
    tokens !== undefined
      ? `${formatTokens(tokens)}/${formatTokens(contextWindow)}`
      : undefined;
  const modeLabel = permissionMode;
  const gitBadge = formatGitBadge(gitInfo);
  const warning =
    missingLspLanguages.length > 0
      ? `${symbols.warning} LSP: ${missingLspLanguages[0]}`
      : !permissionsEnabled
        ? `${symbols.warning} permissions disabled`
        : undefined;
  const size = responsiveSize(dimensions.width);
  const compact = size === "compact";
  const actionableWarning = warning;
  return (
    <box
      border={["top"]}
      borderColor={color.border.default}
      height={3}
      flexShrink={0}
    >
      <box flexDirection="column" paddingX={1}>
        <box flexDirection="row" justifyContent="space-between">
          <text fg={color.text.primary}>
            {formatCwd(cwd)}
            {gitBadge ? ` · ${gitBadge}` : ""}
          </text>
          <text fg={color.text.muted}>
            {compact ? modeLabel : `⇧Tab ${modeLabel}`}
          </text>
        </box>
        <box flexDirection="row" justifyContent="space-between">
          <box flexDirection="row" flexShrink={1}>
            {!compact && (
              <text fg={color.text.secondary}>
                {modelLabel}
                {variantText}
              </text>
            )}
            <text fg={color.text.muted}> · </text>
            {tokenInfo && <text fg={color.text.muted}>{tokenInfo} </text>}
            {!compact && (
              <Progress value={tokens ?? 0} maximum={contextWindow} width={6} />
            )}
            <text fg={pct >= 90 ? color.status.danger : color.text.muted}>
              {contextLevel === "critical" || contextLevel === "attention"
                ? ` ${symbols.warning} ${pct}% context`
                : ` ${pct}%`}
            </text>
            {actionableWarning && !compact && (
              <text fg={color.status.warning}> · {actionableWarning}</text>
            )}
            {compact && actionableWarning && (
              <text fg={color.status.warning}> {actionableWarning}</text>
            )}
          </box>
          <text fg={color.text.muted}>? help</text>
        </box>
      </box>
    </box>
  );
}

export function formatTokens(tokens: number): string {
  if (tokens < 1000) return String(tokens);
  const value = tokens / 1000;
  return `${Number.isInteger(value) ? value : value.toFixed(1)}k`;
}
