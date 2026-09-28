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
const COLLAPSED_OUTPUT_LINES = 3;

function outputPreview(content: string): {
  lines: string[];
  remaining: number;
} {
  const normalized = content.replace(/\r\n/g, "\n").trimEnd();
  const lines: string[] = [];
  let start = 0;
  for (let i = 0; i < COLLAPSED_OUTPUT_LINES; i++) {
    const newline = normalized.indexOf("\n", start);
    if (newline < 0) {
      if (start < normalized.length) lines.push(normalized.slice(start));
      return { lines, remaining: 0 };
    }
    lines.push(normalized.slice(start, newline));
    start = newline + 1;
  }
  let remaining = 1;
  for (let i = start; i < normalized.length; i++)
    if (normalized[i] === "\n") remaining++;
  return { lines, remaining };
}

function terminalContent(item: ToolItemData): string {
  if (item.display?.kind !== "terminal") return item.content ?? "";
  if (item.content) return item.content;
  return (
    [item.display.stdout, item.display.stderr].filter(Boolean).join("\n") || ""
  );
}

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
        duration:
          item.running && !item.preparing
            ? runningDuration(item)
            : item.durationMs !== undefined && item.durationMs >= 1000
              ? `${(item.durationMs / 1000).toFixed(1)}s`
              : undefined,
      },
      width - 1,
    );
    // ponytail: keep output in one text node so full retained results don't fan out into line nodes.
    const needsErrorOutput = expanded && item.isError;
    const needsPlainBody = expanded && !item.display && !item.isError;
    const needsLsp = expanded && item.display;
    const body =
      needsErrorOutput || needsPlainBody ? terminalContent(item) : "";
    const collapsedContent = !expanded
      ? item.display?.kind === "terminal"
        ? terminalContent(item)
        : item.display?.kind === "code"
          ? item.display.content
          : !item.display
            ? terminalContent(item)
            : ""
      : "";
    const { lines: visiblePreview, remaining: remainingPreviewLines } =
      outputPreview(collapsedContent);
    const lspLines = needsLsp ? lspOutput(item.content) : [];

    return (
      <box flexDirection="column" width="100%" minWidth={0}>
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
          <text width="100%" wrapMode="char">
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
          <text width="100%" wrapMode="char">
            <span fg={theme.accent}>│ $ </span>
            <span attributes={TextAttributes.ITALIC} fg={theme.text.muted}>
              {redactCommand(item.cmd)}
            </span>
          </text>
        ) : null}
        {visiblePreview.length ? (
          <box
            flexDirection="column"
            width="100%"
            minWidth={0}
            border={["left"]}
            borderColor={theme.border.focused}
            paddingLeft={1}
          >
            <text wrapMode="char" fg={theme.text.secondary}>
              {visiblePreview.join("\n")}
            </text>
            {remainingPreviewLines ? (
              <text fg={theme.text.muted}>
                … {remainingPreviewLines} more lines · click to expand
              </text>
            ) : null}
          </box>
        ) : null}
        {expanded && item.isError && item.display?.kind === "terminal" ? (
          <box
            flexDirection="column"
            width="100%"
            minWidth={0}
            border={["left"]}
            borderColor={theme.border.focused}
            paddingLeft={1}
          >
            <text wrapMode="char" fg={theme.status.danger}>
              {body}
            </text>
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
            <ToolDisplayComponent display={item.display} view="unified" />
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
          <box
            flexDirection="column"
            width="100%"
            minWidth={0}
            border={["left"]}
            borderColor={theme.border.focused}
            paddingLeft={1}
          >
            <text
              wrapMode="char"
              fg={item.isError ? theme.status.danger : theme.text.muted}
            >
              {body}
            </text>
          </box>
        ) : null}
      </box>
    );
  },
  (prev, next) =>
    prev.item === next.item && prev.terminalWidth === next.terminalWidth,
);
