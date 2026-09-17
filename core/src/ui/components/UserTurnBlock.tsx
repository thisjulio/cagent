import { TextAttributes } from "@opentui/core";
import type { UserTurnBlock } from "../render/blocks";
import { formatTime } from "../render/time";
import { escapeRegExp } from "../render/text";

export function UserTurnBlockComponent({ block }: { block: UserTurnBlock }) {
  const item = block.items[0];
  const imagePaths = item.imagePaths ?? [];
  const textWithoutImages = imagePaths.length > 0
    ? item.content.replace(new RegExp(imagePaths.map(escapeRegExp).sort((a, b) => b.length - a.length).join("|"), "g"), "").trim()
    : item.content;

  return (
    <box paddingX={2} marginTop={1} marginBottom={1} width="100%" flexDirection="column" flexShrink={0}>
      <text fg="#d97757">You <span attributes={TextAttributes.DIM}>{formatTime(block.timestamp)}</span></text>
      <text>
        <span fg="#d97757">└─ </span>{textWithoutImages || " "}
      </text>
      {imagePaths.map((path) => (
        <text key={`img-${path}`}>
          <span fg="#d97757">    </span>
          <span fg="#a78bfa">[Image: {path}]</span>
        </text>
      ))}
    </box>
  );
}
