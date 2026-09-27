import { memo } from "react";
import { TextAttributes } from "@opentui/core";
import type { ToolItem as ToolItemData } from "../render/blocks";
import { layoutToolRow } from "../render/tool-row";
import { defaultExpanded } from "../../controller/expansion";
import { ToolDisplayComponent } from "./ToolDisplay";
import { cachedDiffStats } from "../../controller/diff-stats";
import { redactCommand } from "../../tool-preview";
import { useTheme } from "../primitives/theme-context";
import { symbols } from "../theme/symbols";
import { DisclosureIndicator } from "../primitives/DisclosureIndicator";

const TURN_INSET = 5;
const MAX_EXPANDED_ERROR_LINES = 8;
const MAX_PLAIN_BODY_LINES = 200;

function lspOutput(content: string | undefined): string[] {
  const lines = content?.split("\n") ?? [];
  const start = lines.findIndex((line) => line.startsWith("LSP · "));
  return start < 0 ? [] : lines.slice(start);
}

function rowTitle(item: ToolItemData): string {
  if (item.toolName === "subagent" && item.title === "subagent")
    return `Subagent @${item.cmd ?? "agent"}`;
  const title = item.title ?? item.toolName ?? "tool";
  return item.running && !item.title && item.cmd
    ? `${title} ${item.cmd}`
    : title;
}

function runningDuration(item: ToolItemData): string {
  const elapsed = item.timestamp ? Math.max(0, Date.now() - item.timestamp) : 0;
  return `running ${(elapsed / 1000).toFixed(1)}s`;
}

export const ToolItemComponent = memo(
  function ToolItemComponent({
    item,
    onClick,
    terminalWidth,
  }: {
    item: ToolItemData;
    onClick: () => void;
    terminalWidth: number;
  }) {
    const { color: theme } = useTheme();
    const width = Math.max(12, terminalWidth - TURN_INSET);
    const expanded =
      item.expanded ??
      defaultExpanded({
        kind: "tool",
        content: item.content ?? "",
        isError: item.isError,
        denied: item.denied,
        display: item.display,
      });
    const status = item.running
      ? symbols.running
      : item.denied
        ? symbols.denied
        : item.isError
          ? symbols.error
          : symbols.success;
    const statusColor = item.running
      ? theme.status.warning
      : item.denied
        ? theme.text.muted
        : item.isError
          ? theme.status.danger
          : theme.status.success;
    const diff =
      item.display?.kind === "diff" ? cachedDiffStats(item.display) : undefined;
    const row = layoutToolRow(
      {
        status,
        icon: item.toolCategory === "write" ? "✎" : undefined,
        title: rowTitle(item),
        path:
          item.toolCategory === "read" || item.toolCategory === "write"
            ? item.cmd
            : undefined,
        summary: item.summary,
        added: diff?.added,
        removed: diff?.removed,
        duration: item.running
          ? runningDuration(item)
          : item.durationMs !== undefined && item.durationMs >= 1000
            ? `${(item.durationMs / 1000).toFixed(1)}s`
            : undefined,
      },
      width - 1,
    );
    // ponytail: the body strings are only needed when expanded; split lazily
    // and cap plain output so a huge tool dump can't create thousands of nodes.
    const needsErrorTail = expanded && item.isError;
    const needsPlainBody = expanded && !item.display && !item.isError;
    const needsLsp = expanded && item.display;
    const body =
      needsErrorTail || needsPlainBody
        ? item.display?.kind === "terminal"
          ? `${item.display.stdout}${item.display.stderr ? `\n${item.display.stderr}` : ""}`.split(
              "\n",
            )
          : (item.content?.split("\n") ?? [])
        : [];
    const truncatedPlain = needsPlainBody && body.length > MAX_PLAIN_BODY_LINES;
    const visibleBody = item.isError
      ? body.slice(-MAX_EXPANDED_ERROR_LINES)
      : truncatedPlain
        ? body.slice(0, MAX_PLAIN_BODY_LINES)
        : body;
    const lspLines = needsLsp ? lspOutput(item.content) : [];

    return (
      <box flexDirection="column">
        <box
          flexDirection="row"
          width="100%"
          onMouseDown={(event) => {
            if (event.button === 0) {
              event.preventDefault();
              event.stopPropagation();
              onClick();
            }
          }}
        >
          <text fg={theme.accent}>├─ </text>
          <text fg={statusColor}>{status}</text>
          <DisclosureIndicator expanded={expanded} />
          <text fg={theme.text.primary} wrapMode="none">
            {row.left.slice("├─ ".length + status.length)}
          </text>
          {row.right ? (
            <text attributes={TextAttributes.DIM}>
              {" · "}
              {row.right}
            </text>
          ) : null}
        </box>
        {row.path ? (
          <text wrapMode="none">
            <span fg={theme.accent}>│ ↳ </span>
            <span fg={theme.text.muted}>{row.path}</span>
          </text>
        ) : item.detail ? (
          <text wrapMode="word">
            <span fg={theme.accent}>│ ↳ </span>
            <span fg={theme.text.muted}>{item.detail}</span>
          </text>
        ) : null}
        {item.toolCategory === "shell" && item.cmd ? (
          <text wrapMode="none">
            <span fg={theme.accent}>│ $ </span>
            <span attributes={TextAttributes.ITALIC} fg={theme.text.muted}>
              {redactCommand(item.cmd)}
            </span>
          </text>
        ) : null}
        {expanded && item.isError && item.display?.kind === "terminal" ? (
          <box flexDirection="column" width="100%" minWidth={0}>
            {visibleBody.map((line, index) => (
              <text key={`tool-error-${index}`} wrapMode="word">
                <span fg={theme.accent}>│ </span>
                <span fg={theme.status.danger}>{line || " "}</span>
              </text>
            ))}
          </box>
        ) : expanded && item.display ? (
          <box
            flexDirection="column"
            width="100%"
            minWidth={0}
            overflow="hidden"
            border={["left"]}
            borderColor={theme.border.focused}
            paddingLeft={1}
          >
            <ToolDisplayComponent
              display={item.display}
              view="unified"
              maxRows={item.expanded === true ? undefined : 12}
            />
            {lspLines.length ? (
              <box
                flexDirection="column"
                border={["top"]}
                borderColor={theme.status.info}
                paddingTop={1}
              >
                {lspLines.map((line, index) => (
                  <text key={`lsp-${index}`} wrapMode="word">
                    <span
                      fg={
                        index === 0 ? theme.status.info : theme.text.secondary
                      }
                    >
                      {line || " "}
                    </span>
                  </text>
                ))}
              </box>
            ) : null}
          </box>
        ) : expanded ? (
          <box flexDirection="column">
            {visibleBody.map((line, index) => (
              <text key={`tool-line-${index}`} wrapMode="word">
                <span fg={theme.accent}>│ </span>
                <span
                  fg={item.isError ? theme.status.danger : theme.text.muted}
                >
                  {line || " "}
                </span>
              </text>
            ))}
            {truncatedPlain ? (
              <text wrapMode="word">
                <span fg={theme.accent}>│ </span>
                <span fg={theme.text.muted}>
                  … {body.length - MAX_PLAIN_BODY_LINES} more lines
                </span>
              </text>
            ) : null}
          </box>
        ) : null}
      </box>
    );
  },
  (prev, next) =>
    prev.item === next.item && prev.terminalWidth === next.terminalWidth,
);
