import type { ReactNode } from "react";
import { Surface } from "./Surface";
import { Text } from "./Text";

export function Panel({
  title,
  children,
  footer,
  tone = "base",
  grow = false,
}: {
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  tone?: "base" | "focused" | "warning" | "danger";
  grow?: boolean;
}) {
  return (
    <Surface tone={tone} border grow={grow}>
      <Text tone="accent" bold>
        {title}
      </Text>
      {children}
      {footer}
    </Surface>
  );
}
