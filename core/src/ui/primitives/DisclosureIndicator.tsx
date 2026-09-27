import { useTheme } from "./theme-context";
import { symbols } from "../theme/symbols";

export function DisclosureIndicator({ expanded }: { expanded: boolean }) {
  const { color } = useTheme();
  return (
    <text fg={color.text.muted}>
      {expanded ? symbols.expanded : symbols.collapsed}
    </text>
  );
}
