import type { ReactNode } from "react";
import { useTheme } from "./theme-context";

export function Surface({
  children,
  tone = "base",
  border = false,
  grow = false,
}: {
  children: ReactNode;
  tone?: "base" | "focused" | "warning" | "danger";
  border?: boolean;
  grow?: boolean;
}) {
  const { color } = useTheme();
  const borderColor =
    tone === "warning"
      ? color.border.warning
      : tone === "danger"
        ? color.border.danger
        : tone === "focused"
          ? color.border.focused
          : color.border.default;
  return (
    <box
      flexDirection="column"
      width="100%"
      flexGrow={grow ? 1 : undefined}
      flexShrink={grow ? 1 : 0}
      minHeight={grow ? 0 : undefined}
      border={border}
      borderColor={borderColor}
      backgroundColor={color.surface[tone]}
    >
      {children}
    </box>
  );
}
