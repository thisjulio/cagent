import { TextAttributes } from "@opentui/core";
import type { ChatItem } from "../../controller/state";
import { Markdown } from "../render/markdown";
import type { Controller } from "../../controller/controller";
import { categoryLabel } from "../../tool-category";

export function ChatItemRow({ it, index, controller, streaming, showAgentLabel }: { it: ChatItem; index: number; controller: Controller; streaming: boolean; showAgentLabel: boolean }) {
  if (it.kind === "user") return <UserRow it={it} />;
  if (it.kind === "assistant") return <AssistantRow it={it} streaming={streaming} showAgentLabel={showAgentLabel} />;
  if (it.kind === "thinking") return <ThinkingRow it={it} streaming={streaming} showAgentLabel={showAgentLabel} />;
  if (it.kind === "tool") return <ToolRow it={it} onClick={() => controller.toggleToolExpand(index)} showAgentLabel={showAgentLabel} />;
  return <text attributes={TextAttributes.DIM}>{it.content}</text>;
}

function time(ts?: number): string {
  return ts ? new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
}

function UserRow({ it }: { it: ChatItem }) {
  return (
    <box paddingX={2} marginTop={1} marginBottom={1} width="100%" flexDirection="column" flexShrink={0}>
      <text fg="#d97757">You <span attributes={TextAttributes.DIM}>{time(it.timestamp)}</span></text>
      <text>
        <span fg="#d97757">└─ </span>{it.content}
      </text>
    </box>
  );
}

function AssistantRow({ it, streaming, showAgentLabel }: { it: ChatItem; streaming: boolean; showAgentLabel: boolean }) {
  return (
    <box paddingX={2} marginBottom={1} width="100%" flexDirection="column" flexShrink={0}>
      {showAgentLabel ? <text fg="#d97757">cagent <span attributes={TextAttributes.DIM}>{time(it.timestamp)}</span></text> : null}
      <box paddingLeft={showAgentLabel ? 0 : 0} flexDirection="row">
        <text fg="#d97757">└─ </text>
        <box flexGrow={1} paddingLeft={1}>
          {!streaming && it.content ? <Markdown content={it.content} /> : streaming ? <text>{it.content || "..."}</text> : null}
        </box>
      </box>
    </box>
  );
}

function ThinkingRow({ it, streaming, showAgentLabel }: { it: ChatItem; streaming: boolean; showAgentLabel: boolean }) {
  return (
    <box paddingX={2} marginBottom={0} width="100%" flexDirection="column" flexShrink={0}>
      {showAgentLabel ? <text fg="#d97757">cagent <span attributes={TextAttributes.DIM}>{time(it.timestamp)}</span></text> : null}
      <text attributes={TextAttributes.DIM}>
        <span fg="#d97757">├─ </span>
        {streaming ? <span fg="#d97757">thinking ...</span> : "thinking"}
      </text>
      {it.content ? <text attributes={TextAttributes.DIM}>{"│  "}{it.content}</text> : null}
    </box>
  );
}

function ToolRow({ it, onClick, showAgentLabel }: { it: ChatItem; onClick: () => void; showAgentLabel: boolean }) {
  const status = it.running ? "⋯" : it.isError ? "✗" : "⏺";
  const color = it.running ? "#eab308" : it.isError ? "#ef4444" : "#22c55e";
  const lines = it.content ? it.content.split("\n").length : 0;
  return (
    <box paddingX={2} width="100%" flexDirection="column" flexShrink={0} onMouseDown={(event) => { if (event.button === 0) { event.preventDefault(); event.stopPropagation(); onClick(); } }}>
      {showAgentLabel ? <text fg="#d97757">cagent <span attributes={TextAttributes.DIM}>{time(it.timestamp)}</span></text> : null}
      <text>
        <span fg={color}>├─ {status} </span>
        <strong>{categoryLabel(it.toolCategory ?? "generic")}</strong>
        {it.cmd ? (
          <span attributes={TextAttributes.DIM}> · {it.expanded ? it.cmd : it.cmd.length > 40 ? it.cmd.slice(0, 40) + "..." : it.cmd}</span>
        ) : null}
         {it.running ? <span fg="#d97757"> (running {it.startedAt ? ((Date.now() - it.startedAt) / 1000).toFixed(1) : "0.0"}s)</span> : it.durationMs !== undefined ? <span attributes={TextAttributes.DIM}> ({(it.durationMs / 1000).toFixed(1)}s)</span> : null}
         {it.denied ? <span fg="#d97757"> (denied)</span> : null}
        {!it.running && !it.denied && !it.expanded && lines > 0 && (
           <span attributes={TextAttributes.DIM}> +{lines} line{lines === 1 ? "" : "s"} (click to expand; ctrl+o for last)</span>
        )}
      </text>
      {it.expanded && it.content ? (
        <text fg={it.isError ? "red" : undefined} attributes={it.isError ? TextAttributes.NONE : TextAttributes.DIM}>
          {"│  " + it.content.replace(/\n/g, "\n│  ")}
        </text>
      ) : null}
    </box>
  );
}
