import { TextAttributes } from "@opentui/core";
import type { ThinkingItem as ThinkingItemData } from "../render/blocks";
import { defaultExpanded } from "../../controller/expansion";
import type { Controller } from "../../controller/controller";

const MAX_THINKING_LINES = 12;
const MAX_THINKING_CHARS = 2400;

export function ThinkingItemComponent({
  item,
  streaming = false,
  width = 80,
  controller,
}: {
  item: ThinkingItemData;
  streaming?: boolean;
  width?: number;
  controller?: Controller;
}) {
  const content = item.content ?? "";
  const visible =
    content.length > MAX_THINKING_CHARS
      ? content.slice(-MAX_THINKING_CHARS)
      : content;
  const allLines = visible.replace(/\n+$/, "").split("\n");
  const lines = allLines.slice(-MAX_THINKING_LINES);
  const expanded =
    item.expanded ?? defaultExpanded({ kind: "thinking", content });
  const lastLine = allLines.at(-1) ?? "";
  const shortLine =
    lastLine.length > width
      ? `${lastLine.slice(0, Math.max(0, width - 1))}…`
      : lastLine;

  return (
    <box flexDirection="column">
      <text onMouseDown={() => controller?.toggleToolExpand(item.chatIndex)}>
        <span fg="#d97757">├─ </span>
        <strong fg="#888888">
          {expanded
            ? "▾ reasoning"
            : streaming
              ? `▸ reasoning… ${shortLine}`
              : `▸ reasoning · ${allLines.length} ${allLines.length === 1 ? "line" : "lines"}`}
        </strong>
      </text>
      {expanded
        ? lines.map((line, index) => (
            <text
              key={`reasoning-${index}`}
              attributes={TextAttributes.ITALIC}
              wrapMode="word"
            >
              <span fg="#d97757">│ </span>
              <span fg="#888888">{line || " "}</span>
            </text>
          ))
        : null}
    </box>
  );
}
