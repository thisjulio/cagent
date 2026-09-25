import { SyntaxStyle, TextAttributes } from "@opentui/core";
import { useState } from "react";
import type { AgentTurnBlock, AgentItem } from "../render/blocks";
import type { Controller } from "../../controller/controller";
import type { ToolCategory } from "../../tool-category";
import { formatTime } from "../render/time";
import { ToolDisplayComponent } from "./ToolDisplay";
import { redactCommand } from "../../tool-preview";

const MAX_THINKING_LINES = 12;
const MAX_THINKING_CHARS = 2400;
const markdownSyntaxStyle = SyntaxStyle.create();

function categoryIcon(category: ToolCategory): string {
  return {
    shell: "⌘",
    read: "◉",
    write: "✎",
    search: "⌕",
    skill: "✦",
    agent: "◆",
    mcptool: "◇",
    generic: "•",
  }[category];
}

function resultSummary(item: Extract<AgentItem, { type: "TOOL" }>): string {
  if (item.running || !item.content) return "";
  const content = item.content;
  if (item.isError) return "exit 1";
  if (item.toolCategory === "search") {
    const count = content.split("\n").filter((line) => line.trim()).length;
    return `${count} resultado${count === 1 ? "" : "s"}`;
  }
  if (item.toolCategory === "shell" && /(?:pass|test)/i.test(item.cmd ?? "")) {
    const match = content.match(/(\d+)\s+(?:pass|passed)/i);
    return match ? `${match[1]} pass` : "pass";
  }
  return "";
}

function lspOutput(content: string | undefined): string[] {
  if (!content) return [];
  const lines = content.split("\n");
  const start = lines.findIndex(
    (line) => line === "LSP diagnostics:" || line.startsWith("LSP impact"),
  );
  return start < 0 ? [] : lines.slice(start);
}

function wrapCommand(command: string, width: number): string[] {
  if (command.length <= width) return [command];
  const lines: string[] = [];
  let remaining = command;
  while (remaining.length > width) {
    const splitAt = remaining.lastIndexOf(" ", width);
    const index = splitAt > 0 ? splitAt : width;
    lines.push(remaining.slice(0, index));
    remaining = remaining.slice(index).trimStart();
  }
  lines.push(remaining);
  return lines;
}

function ThinkingItemComponent({
  item,
}: {
  item: Extract<AgentItem, { type: "THINKING" }>;
}) {
  const [collapsed, setCollapsed] = useState(true);
  const content = item.content ?? "";
  const visible =
    content.length > MAX_THINKING_CHARS
      ? content.slice(-MAX_THINKING_CHARS)
      : content;
  const allLines = visible.replace(/\n+$/, "").split("\n");
  const lines = allLines.slice(-MAX_THINKING_LINES);

  return (
    <box flexDirection="column">
      <text onMouseDown={() => setCollapsed((value) => !value)}>
        <span fg="#d97757">├─ </span>
        <strong fg="#ffffff">{collapsed ? "▸" : "▾"} thinking</strong>
      </text>
      {!collapsed && (
        <box flexDirection="column">
          {lines.map((line, lineIndex) => (
            <text
              key={`thinking-line-${lineIndex}`}
              attributes={TextAttributes.ITALIC}
              wrapMode="word"
            >
              <span fg="#d97757">│ </span>
              <span fg="#888888">{line || " "}</span>
            </text>
          ))}
        </box>
      )}
      <text fg="#d97757">│ </text>
    </box>
  );
}

function ToolItemComponent({
  item,
  onClick,
}: {
  item: Extract<AgentItem, { type: "TOOL" }>;
  onClick: () => void;
}) {
  const status = item.running ? "⋯" : item.isError ? "✗" : "⏺";
  const color = item.running ? "#eab308" : item.isError ? "#ef4444" : "#22c55e";
  const lines = item.content ? item.content.split("\n").length : 0;
  const duration = item.running
    ? `(running ${item.timestamp ? ((Date.now() - item.timestamp) / 1000).toFixed(1) : "0.0"}s)`
    : item.durationMs !== undefined && item.durationMs >= 1000
      ? `(${(item.durationMs / 1000).toFixed(1)}s)`
      : item.denied
        ? "(denied)"
        : "";
  const lineHint =
    !item.running && !item.denied && !item.expanded && lines > 0
      ? `+${lines} line${lines === 1 ? "" : "s"} (ctrl+o)`
      : "";
  const details = [duration, resultSummary(item), lineHint]
    .filter(Boolean)
    .join(" ");
  const displayExpanded = item.expanded;

  return (
    <box
      flexDirection="column"
      onMouseDown={(event) => {
        if (event.button === 0) {
          event.preventDefault();
          event.stopPropagation();
          onClick();
        }
      }}
    >
      <text wrapMode="word" width="100%">
        <span fg="#d97757">├─ </span>
        <span fg={color}>{status}</span>
        <span fg="#d97757"> </span>
        <strong>{categoryIcon(item.toolCategory ?? "generic")}</strong>
        {item.toolName ? (
          <span attributes={TextAttributes.DIM}>
            {" "}
            · {item.title ?? item.toolName}
          </span>
        ) : item.title ? (
          <span attributes={TextAttributes.DIM}> · {item.title}</span>
        ) : null}
        {!item.title && item.cmd ? (
          <span attributes={TextAttributes.DIM}>
            {" "}
            ·{" "}
            {wrapCommand(
              displayExpanded
                ? item.cmd
                : item.cmd.length > 40
                  ? item.cmd.slice(0, 40) + "..."
                  : item.cmd,
              71,
            ).join("\n│")}
          </span>
        ) : null}
        {details ? (
          <span attributes={TextAttributes.DIM}> {details}</span>
        ) : null}
      </text>
      {item.cmd ? (
        <text>
          <span fg="#d97757">│</span>
          <span fg="#d97757">{"  └─ "}</span>
          {item.toolCategory === "shell" ? <span fg="#d97757">$ </span> : null}
          <span attributes={TextAttributes.ITALIC} fg="#888888">
            {redactCommand(item.cmd)}
          </span>
        </text>
      ) : null}
      {displayExpanded && item.display ? (
        <>
          <box
            flexDirection="row"
            width="100%"
            minWidth={0}
            overflow="hidden"
            border={["left"]}
            borderColor="#d97757"
            paddingLeft={1}
          >
            <box flexGrow={1} flexBasis={0} minWidth={0} flexShrink={1}>
              <ToolDisplayComponent display={item.display} />
            </box>
          </box>
          {lspOutput(item.content).length > 0 ? (
            <box flexDirection="column" width="100%" minWidth={0}>
              <text key="lsp-separator">
                <span fg="#d97757">│</span>
              </text>
              {lspOutput(item.content).map((line, lineIndex) => (
                <text key={`lsp-line-${lineIndex}`}>
                  <span fg="#d97757">│ </span>
                  <span
                    fg={
                      line.startsWith("LSP ")
                        ? "#f59e0b"
                        : item.isError
                          ? "#fca5a5"
                          : "#f59e0b"
                    }
                  >
                    {line}
                  </span>
                </text>
              ))}
            </box>
          ) : null}
        </>
      ) : displayExpanded && item.content ? (
        <box flexDirection="column" width="100%" minWidth={0}>
          {item.content.split("\n").map((line, lineIndex) => (
            <text
              key={`tool-line-${lineIndex}`}
              attributes={
                item.isError ? TextAttributes.NONE : TextAttributes.DIM
              }
            >
              <span fg="#d97757">│ </span>
              <span fg={item.isError ? "red" : undefined}>{line}</span>
            </text>
          ))}
        </box>
      ) : null}
      <text fg="#d97757">│ </text>
    </box>
  );
}

function ResponseItemComponent({
  item,
  streaming,
}: {
  item: Extract<AgentItem, { type: "RESPONSE" }>;
  streaming: boolean;
}) {
  return (
    <box flexDirection="row" minWidth={0}>
      <text fg="#d97757">└─ </text>
      <box flexGrow={1} flexBasis={0} minWidth={0} paddingLeft={1}>
        {item.content ? (
          <markdown
            content={item.content}
            syntaxStyle={markdownSyntaxStyle}
            streaming={streaming}
            width="100%"
            minWidth={0}
            height="auto"
          />
        ) : (
          <text>...</text>
        )}
      </box>
    </box>
  );
}

export function AgentTurnBlockComponent({
  block,
  streaming,
  controller,
}: {
  block: AgentTurnBlock;
  streaming: boolean;
  controller: Controller;
}) {
  const changes = block.items.filter(
    (item): item is Extract<AgentItem, { type: "TOOL" }> =>
      item.type === "TOOL" && item.changesWorkspace === true,
  );
  const additions = changes.reduce((sum, item) => {
    const diff = item.display?.kind === "diff" ? item.display.content : "";
    return (
      sum +
      diff
        .split("\n")
        .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
        .length
    );
  }, 0);
  const deletions = changes.reduce((sum, item) => {
    const diff = item.display?.kind === "diff" ? item.display.content : "";
    return (
      sum +
      diff
        .split("\n")
        .filter((line) => line.startsWith("-") && !line.startsWith("---"))
        .length
    );
  }, 0);
  const files = new Set(changes.flatMap((item) => item.changedPaths ?? []));
  const fileCount = files.size || changes.length;

  return (
    <box paddingX={2} width="100%" flexDirection="column" flexShrink={0}>
      <text fg="#d97757">
        cagent{block.subagent ? ` → @${block.subagent}` : ""}{" "}
        <span attributes={TextAttributes.DIM}>
          {formatTime(block.timestamp)}
        </span>
      </text>
      <text fg="#d97757">│ </text>
      {block.items.map((item, index) => {
        if (item.type === "THINKING") {
          return (
            <ThinkingItemComponent key={`thinking-${index}`} item={item} />
          );
        }
        if (item.type === "TOOL") {
          return (
            <ToolItemComponent
              key={`tool-${index}`}
              item={item}
              onClick={() => controller.toggleToolExpand(item.chatIndex)}
            />
          );
        }
        return (
          <ResponseItemComponent
            key={`response-${index}`}
            item={item}
            streaming={streaming}
          />
        );
      })}
      {changes.length ? (
        <text fg="#888888">
          └─ {fileCount} file{fileCount === 1 ? "" : "s"}
          {changes.some((item) => item.display?.kind === "diff")
            ? ` · +${additions} −${deletions}`
            : ""}
          {" · "}
          <span fg="#d97757">/diff</span>
        </text>
      ) : null}
    </box>
  );
}
