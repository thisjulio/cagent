import { TextAttributes } from "@opentui/core";
import type { ChatItem } from "../../controller/state";
import { Markdown } from "../render/markdown";

export function ChatItemRow({ it, streaming }: { it: ChatItem; streaming: boolean }) {
  if (it.kind === "user") return <UserRow it={it} />;
  if (it.kind === "assistant") return <AssistantRow it={it} streaming={streaming} />;
  if (it.kind === "thinking") return <ThinkingRow it={it} streaming={streaming} />;
  if (it.kind === "tool") return <ToolRow it={it} />;
  return <text attributes={TextAttributes.DIM}>{it.content}</text>;
}

function UserRow({ it }: { it: ChatItem }) {
  return (
    <box border borderStyle="single" borderColor="cyan" paddingX={1} width="100%" flexDirection="column" flexShrink={0}>
      <text>
        <span fg="cyan">&gt; </span>
        {it.content}
      </text>
    </box>
  );
}

function AssistantRow({ it, streaming }: { it: ChatItem; streaming: boolean }) {
  return (
    <box border borderStyle="single" borderColor="#666666" paddingX={1} width="100%" flexDirection="column" flexShrink={0}>
      {!streaming && it.content ? <Markdown content={it.content} /> : <text>{it.content || "..."}</text>}
    </box>
  );
}

function ThinkingRow({ it, streaming }: { it: ChatItem; streaming: boolean }) {
  return (
    <box border borderStyle="single" borderColor="#666666" paddingX={1} width="100%" flexDirection="column" flexShrink={0}>
      <text attributes={TextAttributes.DIM}>
        <span fg="cyan">~ </span>
        {streaming ? <span fg="yellow">thinking ...</span> : "thinking"}
      </text>
      {it.content ? <text attributes={TextAttributes.DIM}>{it.content}</text> : null}
    </box>
  );
}

function ToolRow({ it }: { it: ChatItem }) {
  const status = it.running ? "⋯" : it.isError ? "✗" : "⏺";
  const color = it.isError ? "red" : it.running ? "yellow" : "green";
  const lines = it.content ? it.content.split("\n").length : 0;
  return (
    <box border borderStyle="single" borderColor={it.isError ? "red" : "#666666"} paddingX={1} width="100%" flexDirection="column" flexShrink={0}>
      <text>
        <span fg={color}>{status} </span>
        <strong>{it.toolName ?? "?"}</strong>
        {it.cmd ? (
          <span attributes={TextAttributes.DIM}> · {it.expanded ? it.cmd : it.cmd.length > 40 ? it.cmd.slice(0, 40) + "..." : it.cmd}</span>
        ) : null}
         {it.running ? <span fg="yellow"> (running...)</span> : null}
         {it.denied ? <span fg="yellow"> (denied)</span> : null}
        {!it.running && !it.denied && !it.expanded && lines > 0 && (
           <span attributes={TextAttributes.DIM}> +{lines} line{lines === 1 ? "" : "s"} (ctrl+o)</span>
        )}
      </text>
      {it.expanded && it.content ? (
        <text fg={it.isError ? "red" : undefined} attributes={it.isError ? TextAttributes.NONE : TextAttributes.DIM}>
          {"  " + it.content.replace(/\n/g, "\n  ")}
        </text>
      ) : null}
    </box>
  );
}
