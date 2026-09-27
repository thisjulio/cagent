import type { ReactNode } from "react";

export function Row({
  children,
  justifyContent = "flex-start",
}: {
  children: ReactNode;
  justifyContent?: "flex-start" | "space-between";
}) {
  return (
    <box flexDirection="row" justifyContent={justifyContent}>
      {children}
    </box>
  );
}
