import { useTerminalDimensions } from "@opentui/react";
import { useTheme } from "./theme-context";

export function Divider({ width }: { width?: number } = {}) {
  const { color } = useTheme();
  const dimensions = useTerminalDimensions();
  return (
    <text fg={color.border.default} wrapMode="none">
      {"─".repeat(Math.max(1, width ?? dimensions.width))}
    </text>
  );
}
