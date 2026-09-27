import { useTheme } from "../primitives/theme-context";
import { Panel } from "../primitives/Panel";
import { responsiveSize } from "../theme/breakpoints";
import { useTerminalDimensions } from "@opentui/react";

export function ModelPicker({
  routes,
  query,
  selectedIndex,
  onSelect,
}: {
  routes: string[];
  query: string;
  selectedIndex: number;
  onSelect: (route: string) => void;
}) {
  const { color } = useTheme();
  const { width } = useTerminalDimensions();
  const compact = responsiveSize(width) === "compact";
  return (
    <Panel title="Select model" tone="focused">
      <text fg={color.text.muted}>Search: {query || "(all models)"}</text>
      {routes.length === 0 ? (
        <text fg={color.text.muted}>No matching models</text>
      ) : null}
      <select
        focused
        selectedIndex={selectedIndex}
        height={Math.min(8, Math.max(1, routes.length))}
        options={routes.map((route) => ({
          name: compact ? (route.split("/").at(-1) ?? route) : route,
          description: "",
          value: route,
        }))}
        onSelect={(_, option) => {
          if (option?.value) onSelect(String(option.value));
        }}
      />
      <text fg={color.text.muted}>↑↓ navigate · Enter select · Esc cancel</text>
    </Panel>
  );
}
