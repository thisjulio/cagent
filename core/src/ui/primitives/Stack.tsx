import type { ReactNode } from "react";

export function Stack({
  children,
  height,
}: {
  children: ReactNode;
  height?: number | `${number}%` | "auto";
}) {
  return (
    <box flexDirection="column" height={height}>
      {children}
    </box>
  );
}
