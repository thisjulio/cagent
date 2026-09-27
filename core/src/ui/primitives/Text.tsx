import type { ReactNode } from "react";
import { TextAttributes } from "@opentui/core";
import { useTheme } from "./theme-context";
import { typography } from "../theme/typography";

type Tone =
  | "primary"
  | "secondary"
  | "muted"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "info";

export function Text({
  children,
  tone = "primary",
  bold = false,
  dim = false,
  role,
}: {
  children: ReactNode;
  tone?: Tone;
  bold?: boolean;
  dim?: boolean;
  role?: keyof typeof typography;
}) {
  const { color } = useTheme();
  const fg =
    tone === "primary" || tone === "secondary" || tone === "muted"
      ? color.text[tone]
      : tone === "accent"
        ? color.accent
        : color.status[tone];
  const attributes =
    (role ? typography[role] : TextAttributes.NONE) |
    (bold ? typography.emphasis : TextAttributes.NONE) |
    (dim ? typography.metadata : TextAttributes.NONE);

  return (
    <text fg={fg} attributes={attributes}>
      {children}
    </text>
  );
}
