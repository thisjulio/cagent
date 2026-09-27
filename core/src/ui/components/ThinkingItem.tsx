import { memo } from "react";
import { Text } from "../primitives/Text";
import { DisclosureIndicator } from "../primitives/DisclosureIndicator";
import type { AgentItem } from "../render/blocks";

// ponytail: default memo works because ChatViewport reuses item refs for
// unchanged history; only the streaming tail re-renders.
export const ThinkingItemComponent = memo(function ThinkingItemComponent({
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
  return (
    <box flexDirection="column">
      <box flexDirection="row">
        <Text tone="accent">├─ </Text>
        <DisclosureIndicator expanded={Boolean(item.expanded)} />
        <Text tone="muted"> {summary}</Text>
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
});
