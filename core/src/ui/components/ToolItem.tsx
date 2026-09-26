import { TextAttributes } from "@opentui/core";
import type { ToolItem as ToolItemData } from "../render/blocks";
import { layoutToolRow } from "../render/tool-row";
import { defaultExpanded } from "../../controller/expansion";
import { ToolDisplayComponent } from "./ToolDisplay";
import { diffStats } from "../../controller/diff-stats";
import { redactCommand } from "../../tool-preview";

const TURN_INSET = 5;
const MAX_EXPANDED_ERROR_LINES = 8;

function lspOutput(content: string | undefined): string[] {
  const lines = content?.split("\n") ?? [];
  const start = lines.findIndex((line) => line.startsWith("LSP · "));
  return start < 0 ? [] : lines.slice(start);
}

function rowTitle(item: ToolItemData): string {
  const title = item.title ?? item.toolName ?? "tool";
  return item.running && !item.title && item.cmd
    ? `${title} ${item.cmd}`
    : title;
}

function runningDuration(item: ToolItemData): string {
  const elapsed = item.timestamp ? Math.max(0, Date.now() - item.timestamp) : 0;
  return `running ${(elapsed / 1000).toFixed(1)}s`;
}

export function ToolItemComponent({
  item,
  onClick,
  terminalWidth,
}: {
  item: ToolItemData;
  onClick: () => void;
  terminalWidth: number;
}) {
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
    ? "⋯"
    : item.denied
      ? "⊘"
      : item.isError
        ? "✗"
        : "✓";
  const color = item.running
    ? "#eab308"
    : item.denied
      ? "#888888"
      : item.isError
        ? "#ef4444"
        : "#22c55e";
  const diff =
    item.display?.kind === "diff" ? diffStats(item.display.content) : undefined;
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
    width,
  );
  const body =
    item.display?.kind === "terminal"
      ? `${item.display.stdout}${item.display.stderr ? `\n${item.display.stderr}` : ""}`.split(
          "\n",
        )
      : (item.content?.split("\n") ?? []);
  const visibleBody = item.isError
    ? body.slice(-MAX_EXPANDED_ERROR_LINES)
    : body;
  const lspLines = lspOutput(item.content);

  return (
    <box flexDirection="column">
      <text
        wrapMode="none"
        width="100%"
        onMouseDown={(event) => {
          if (event.button === 0) {
            event.preventDefault();
            event.stopPropagation();
            onClick();
          }
        }}
      >
        <span fg="#d97757">├─ </span>
        <span fg={color}>{status}</span>
        {row.left.slice("├─ ".length + status.length)}
        {row.right ? (
          <span attributes={TextAttributes.DIM}>
            {"  "}
            {row.right}
          </span>
        ) : null}
      </text>
      {item.toolCategory === "shell" && item.cmd ? (
        <text wrapMode="none">
          <span fg="#d97757">│ $ </span>
          <span attributes={TextAttributes.ITALIC} fg="#888888">
            {redactCommand(item.cmd)}
          </span>
        </text>
      ) : null}
      {expanded && item.isError && item.display?.kind === "terminal" ? (
        <box flexDirection="column" width="100%" minWidth={0}>
          {visibleBody.map((line, index) => (
            <text key={`tool-error-${index}`} wrapMode="word">
              <span fg="#d97757">│ </span>
              <span fg="#fca5a5">{line || " "}</span>
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
          borderColor="#d97757"
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
              borderColor="#6366f1"
              paddingTop={1}
            >
              {lspLines.map((line, index) => (
                <text key={`lsp-${index}`} wrapMode="word">
                  <span fg={index === 0 ? "#a5b4fc" : "#c9d1d9"}>
                    {line || " "}
                  </span>
                </text>
              ))}
            </box>
          ) : null}
        </box>
      ) : expanded ? (
        visibleBody.map((line, index) => (
          <text key={`tool-line-${index}`} wrapMode="word">
            <span fg="#d97757">│ </span>
            <span fg={item.isError ? "#fca5a5" : "#888888"}>{line || " "}</span>
          </text>
        ))
      ) : null}
    </box>
  );
}
