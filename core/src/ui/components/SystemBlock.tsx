import { TextAttributes } from "@opentui/core";
import { memo } from "react";
import type { SystemBlock } from "../render/blocks";
import { formatSystemTime } from "../render/time";
import { useTheme } from "../primitives/theme-context";

export const SystemBlockComponent = memo(function SystemBlockComponent({
  block,
}: {
  block: SystemBlock;
}) {
  const { color } = useTheme();
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
        <span fg={color.accent}>├─ </span>
        <strong fg={color.status.special}>
          {compacted ? "context compacted" : "info"}
        </strong>
        {item.timestamp ? (
          <span attributes={TextAttributes.DIM}>
            {` ${formatSystemTime(item.timestamp)}`}
          </span>
        ) : null}
      </text>
      <box flexDirection="column">
        {(compacted ? compacted[1] : item.content)
          .split("\n")
          .map((line, lineIndex) => (
            <text key={`system-line-${lineIndex}`}>
              <span fg={color.accent}>│ </span>
              <span attributes={TextAttributes.DIM}>{line}</span>
            </text>
          ))}
      </box>
    </box>
  );
});
