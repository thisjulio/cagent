import type { ChatItem } from "./state";
import { diffStats } from "./diff-stats";

export function deriveSummary(item: ChatItem): string | undefined {
  if (item.denied) return "denied";
  if (item.isError) return "failed";
  if (item.display?.kind === "diff") {
    const { added, removed } = diffStats(item.display.content);
    return `+${added} −${removed}`;
  }
  if (item.display?.kind === "terminal") {
    return item.display.timedOut
      ? "timed out"
      : item.display.exitCode !== undefined
        ? `exit ${item.display.exitCode}`
        : undefined;
  }
  // Search counts are plugin-owned; the core must not interpret their output.
  return undefined;
}
