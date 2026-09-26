import type { ChatItem } from "./state";
import { diffStats } from "./diff-stats";

export function defaultExpanded(item: ChatItem): boolean {
  if (item.display?.kind === "diff") {
    const { added, removed } = diffStats(item.display.content);
    return added + removed <= 12;
  }
  return item.kind === "tool" && item.isError === true && item.denied !== true;
}

export function isExpandable(item: ChatItem): boolean {
  return item.kind === "tool" || item.kind === "thinking";
}

export function expandedState(item: ChatItem): boolean {
  return item.expanded ?? defaultExpanded(item);
}
