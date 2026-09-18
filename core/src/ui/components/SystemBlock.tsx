import { TextAttributes } from "@opentui/core";
import type { SystemBlock } from "../render/blocks";

function time(ts?: number): string {
  return ts
    ? new Date(ts).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      })
    : "";
}

export function SystemBlockComponent({ block }: { block: SystemBlock }) {
  const item = block.item;
  const compacted = item.content.match(/^compacted:\s*(.+)$/);

  return (
    <box
      paddingX={2}
      marginTop={1}
      marginBottom={1}
      width="100%"
      flexDirection="column"
      flexShrink={0}
    >
      <text>
        <span fg="#d97757">├─ </span>
        <strong fg="#a78bfa">{compacted ? "context compacted" : "info"}</strong>
        {item.timestamp ? (
          <span attributes={TextAttributes.DIM}> {time(item.timestamp)}</span>
        ) : null}
      </text>
      <text>
        <span fg="#d97757">│ </span>
        <span attributes={TextAttributes.DIM}>
          {compacted ? compacted[1] : item.content}
        </span>
      </text>
    </box>
  );
}
