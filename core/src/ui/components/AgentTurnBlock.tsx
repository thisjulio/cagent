import { SyntaxStyle, TextAttributes } from "@opentui/core";
import type { AgentTurnBlock, AgentItem } from "../render/blocks";
import type { Controller } from "../../controller/controller";
import { categoryLabel } from "../../tool-category";
import { formatTime } from "../render/time";
import { ToolDisplayComponent } from "./ToolDisplay";
import type { ToolDisplay } from "@cagent/sdk";
import { redactCommand } from "../../tool-preview";

const MAX_THINKING_LINES = 12;
const MAX_THINKING_CHARS = 2400;
const markdownSyntaxStyle = SyntaxStyle.create();

function displayLineCount(display: ToolDisplay): number {
  if (display.kind === "terminal") {
    const stdout = display.stdout.trimEnd();
    const stderr = (display.stderr ?? "").trimEnd();
    const outputLines = [
      ...(stdout ? stdout.split("\n") : []),
      ...(stderr ? stderr.split("\n") : []),
    ].slice(0, 12);
    const statusLine =
      display.timedOut ||
      (display.exitCode !== undefined && display.exitCode !== 0)
        ? 1
        : 0;
    return Math.max(1, outputLines.length + statusLine);
  }

  if (display.kind === "diff") {
    const lines = display.content
      .replace(/\r\n/g, "\n")
      .trimEnd()
      .split("\n")
      .filter(
        (line) =>
          line.length > 0 &&
          !line.startsWith("---") &&
          !line.startsWith("+++") &&
          !line.startsWith("@@"),
      );
    return Math.max(1, Math.min(lines.length, 14));
  }

  const maximum = 12;
  return Math.max(
    1,
    display.content.trimEnd().split("\n").slice(0, maximum).length,
  );
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
  const content = item.content ?? "";
  const visible =
    content.length > MAX_THINKING_CHARS
      ? content.slice(-MAX_THINKING_CHARS)
      : content;
  const allLines = visible.replace(/\n+$/, "").split("\n");
  const lines = allLines.slice(-MAX_THINKING_LINES);

  return (
    <box flexDirection="column">
      <text>
        <span fg="#d97757">├─ </span>
        <strong fg="#ffffff">thinking</strong>
      </text>
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
    : item.durationMs !== undefined
      ? `(${(item.durationMs / 1000).toFixed(1)}s)`
      : item.denied
        ? "(denied)"
        : "";
  const lineHint =
    !item.running && !item.denied && !item.expanded && lines > 0
      ? `+${lines} line${lines === 1 ? "" : "s"} (ctrl+o)`
      : "";
  const details = [duration, lineHint].filter(Boolean).join(" ");

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
        <strong>{categoryLabel(item.toolCategory ?? "generic")}</strong>
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
              item.expanded
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
      {item.expanded && item.display ? (
        <>
          <box
            flexDirection="row"
            width="100%"
            minWidth={0}
            overflow="hidden"
            paddingLeft={0}
          >
            <box flexDirection="column" width={3} flexShrink={0}>
              {Array.from(
                { length: displayLineCount(item.display) },
                (_, index) => (
                  <text key={`display-line-${index}`} fg="#d97757">
                    │{" "}
                  </text>
                ),
              )}
            </box>
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
      ) : item.expanded && item.content ? (
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
    </box>
  );
}
