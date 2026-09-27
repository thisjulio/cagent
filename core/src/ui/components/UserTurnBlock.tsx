import { TextAttributes } from "@opentui/core";
import type { UserTurnBlock } from "../render/blocks";
import { formatTime } from "../render/time";
import { escapeRegExp } from "../render/text";
import { useTheme } from "../primitives/theme-context";

export function UserTurnBlockComponent({ block }: { block: UserTurnBlock }) {
  const { color } = useTheme();
  const item = block.items[0];
  const imagePaths = item.imagePaths ?? [];
  const filePaths = item.filePaths ?? [];
  const textWithoutImages =
    imagePaths.length > 0
      ? item.content
          .replace(
            new RegExp(
              imagePaths
                .map(escapeRegExp)
                .sort((a, b) => b.length - a.length)
                .join("|"),
              "g",
            ),
            "",
          )
          .trim()
      : item.content;

  return (
    <box
      paddingX={2}
      marginTop={1}
      marginBottom={1}
      width="100%"
      flexDirection="column"
      flexShrink={0}
    >
      <text fg={color.accent}>
        You{" "}
        <span attributes={TextAttributes.DIM}>
          {formatTime(block.timestamp)}
        </span>
      </text>
      <text>
        <span fg={color.accent}>└─ </span>
        {item.queueStatus ? `[${item.queueStatus}] ` : ""}
        {textWithoutImages || " "}
      </text>
      {imagePaths.map((path) => (
        <text key={`img-${path}`}>
          <span fg={color.accent}> </span>
          <span fg={color.status.special}>[Image: {path}]</span>
        </text>
      ))}
      {filePaths.map((path) => (
        <text key={`file-${path}`}>
          <span fg={color.accent}> </span>
          <span fg={color.status.info}>[File: {path}]</span>
        </text>
      ))}
    </box>
  );
}
