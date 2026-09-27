import type { SkillItem as SkillItemData } from "../render/blocks";
import { defaultExpanded } from "../../controller/expansion";
import { useTheme } from "../primitives/theme-context";
import { symbols } from "../theme/symbols";
import { DisclosureIndicator } from "../primitives/DisclosureIndicator";

export function SkillItemComponent({
  item,
  onClick,
}: {
  item: SkillItemData;
  onClick: () => void;
}) {
  const { color: theme } = useTheme();
  const expanded =
    item.expanded ?? defaultExpanded({ kind: "skill", content: item.content });
  const status = item.running
    ? symbols.running
    : item.denied
      ? symbols.denied
      : item.isError
        ? symbols.error
        : symbols.success;
  const statusColor = item.running
    ? theme.status.warning
    : item.denied
      ? theme.text.muted
      : item.isError
        ? theme.status.danger
        : theme.status.success;
  const title = `skill ${item.name}`;

  return (
    <box flexDirection="column">
      <box
        flexDirection="row"
        width="100%"
        onMouseDown={(event) => {
          if (event.button === 0) {
            event.preventDefault();
            event.stopPropagation();
            onClick();
          }
        }}
      >
        <text fg={theme.accent}>├─ </text>
        <text fg={statusColor}>{status}</text>
        <DisclosureIndicator expanded={expanded} />
        <text fg={theme.text.muted} wrapMode="none">
          {` ${title}`}
        </text>
      </box>
      {expanded
        ? (item.content?.split("\n") ?? []).map((line, index) => (
            <text key={`skill-line-${index}`} wrapMode="word">
              <span fg={theme.accent}>│ </span>
              <span fg={theme.text.secondary}>{line || " "}</span>
            </text>
          ))
        : null}
    </box>
  );
}
