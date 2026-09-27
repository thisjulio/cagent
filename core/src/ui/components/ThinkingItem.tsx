import { Text } from "../primitives/Text";
import type { AgentItem } from "../render/blocks";

export function ThinkingItemComponent({
  item,
  streaming = false,
}: {
  item: Extract<AgentItem, { type: "THINKING" }>;
  streaming?: boolean;
}) {
  const lines = item.content.split("\n");
  const summary = streaming
    ? `reasoning… ${lines[lines.length - 1] ?? ""}`
    : `reasoning · ${lines.length} ${lines.length === 1 ? "line" : "lines"}`;
  const marker = item.expanded ? "▾" : "▸";
  return (
    <box flexDirection="column">
      <box flexDirection="row">
        <Text tone="accent">├─ </Text>
        <Text tone="muted">
          {marker} {summary}
        </Text>
      </box>
      {item.expanded ? (
        <box flexDirection="column" paddingLeft={2}>
          {lines.map((line, index) => (
            <box key={index} flexDirection="row">
              <Text tone="accent">│ </Text>
              <Text tone="secondary">{line || " "}</Text>
            </box>
          ))}
        </box>
      ) : null}
    </box>
  );
}
