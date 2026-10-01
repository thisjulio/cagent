import type { Message } from "@cagent/sdk";

export const READ_ONLY_NOTE = [
  "[runtime state]",
  "Permission mode: read-only. Tools that edit files or run commands are denied. Investigate with read-only tools and describe the changes you would make instead of attempting them.",
].join("\n");

export function runtimeStateMessage(mode: string): Message | undefined {
  return mode === "read-only"
    ? { role: "user", content: READ_ONLY_NOTE }
    : undefined;
}
