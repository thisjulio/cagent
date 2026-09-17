import { TextAttributes } from "@opentui/core";
import type { AgentTurnBlock, AgentItem } from "../render/blocks";
import type { Controller } from "../../controller/controller";
import { Markdown, plainLine } from "../render/markdown";
import { categoryLabel } from "../../tool-category";
import { formatTime } from "../render/time";

const MAX_THINKING_LINES = 12;
const MAX_THINKING_CHARS = 2400;

function ThinkingItemComponent({ item }: { item: Extract<AgentItem, { type: "THINKING" }> }) {
  const content = item.content ?? "";
  const visible = content.length > MAX_THINKING_CHARS ? content.slice(-MAX_THINKING_CHARS) : content;
  const allLines = visible.replace(/\n+$/, "").split("\n");
  const lines = allLines.slice(-MAX_THINKING_LINES);

  return (
    <box flexDirection="column">
      <text>
        <span fg="#d97757">├─ </span><strong fg="#ffffff">thinking</strong>
      </text>
      <box flexDirection="row">
        <text fg="#d97757">│  </text>
        <box flexGrow={1}>
          {lines.map((line, lineIndex) => (
            <text key={`thinking-line-${lineIndex}`} fg="#888888" attributes={TextAttributes.ITALIC}>
              {plainLine(line) || " "}
            </text>
          ))}
        </box>
      </box>
    </box>
  );
}

function ToolItemComponent({ item, onClick }: { item: Extract<AgentItem, { type: "TOOL" }>; onClick: () => void }) {
  const status = item.running ? "⋯" : item.isError ? "✗" : "⏺";
  const color = item.running ? "#eab308" : item.isError ? "#ef4444" : "#22c55e";
  const lines = item.content ? item.content.split("\n").length : 0;
  const duration = item.running
    ? `(running ${item.timestamp ? ((Date.now() - item.timestamp) / 1000).toFixed(1) : "0.0"}s)`
    : item.durationMs !== undefined ? `(${(item.durationMs / 1000).toFixed(1)}s)` : item.denied ? "(denied)" : "";
  const lineHint = !item.running && !item.denied && !item.expanded && lines > 0
    ? `+${lines} line${lines === 1 ? "" : "s"} (ctrl+o)`
    : "";
  const details = [duration, lineHint].filter(Boolean).join(" ");

  return (
    <box flexDirection="column" onMouseDown={(event) => { if (event.button === 0) { event.preventDefault(); event.stopPropagation(); onClick(); } }}>
      <text>
        <span fg="#d97757">├─ </span><span fg={color}>{status}</span><span fg="#d97757"> </span>
        <strong>{categoryLabel(item.toolCategory ?? "generic")}</strong>
        {item.toolName ? <span attributes={TextAttributes.DIM}> · {item.toolName}</span> : null}
        {item.cmd ? (
          <span attributes={TextAttributes.DIM}> · {item.expanded ? item.cmd : item.cmd.length > 40 ? item.cmd.slice(0, 40) + "..." : item.cmd}</span>
        ) : null}
        {details ? <span attributes={TextAttributes.DIM}> {details}</span> : null}
      </text>
      {item.expanded && item.content ? (
        <text attributes={item.isError ? TextAttributes.NONE : TextAttributes.DIM}>
          {item.content.split("\n").map((line, lineIndex) => (
            <span key={`tool-line-${lineIndex}`}>
              {lineIndex > 0 ? "\n" : null}
              <span fg="#d97757">│  </span>
              <span fg={item.isError ? "red" : undefined}>{line}</span>
            </span>
          ))}
        </text>
      ) : null}
    </box>
  );
}

function ResponseItemComponent({ item, streaming }: { item: Extract<AgentItem, { type: "RESPONSE" }>; streaming: boolean }) {
  return (
    <box flexDirection="row">
      <text fg="#d97757">└─ </text>
      <box flexGrow={1} paddingLeft={1}>
        {item.content ? <Markdown content={item.content} streaming={streaming} /> : <text>...</text>}
      </box>
    </box>
  );
}

export function AgentTurnBlockComponent({ block, streaming, controller }: { block: AgentTurnBlock; streaming: boolean; controller: Controller }) {
  return (
    <box paddingX={2} width="100%" flexDirection="column" flexShrink={0}>
      <text fg="#d97757">cagent{block.subagent ? ` → @${block.subagent}` : ""} <span attributes={TextAttributes.DIM}>{formatTime(block.timestamp)}</span></text>
      {block.items.map((item, index) => {
        if (item.type === "THINKING") {
          return <ThinkingItemComponent key={`thinking-${index}`} item={item} />;
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
