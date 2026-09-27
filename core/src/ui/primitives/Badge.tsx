import type { ReactNode } from "react";
import { Text } from "./Text";

export function Badge({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "muted" | "accent" | "success" | "warning" | "danger" | "info";
}) {
  return (
    <Text tone={tone} bold>
      [{children}]
    </Text>
  );
}
