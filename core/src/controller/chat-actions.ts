import type { UIState } from "./state";
import { defaultExpanded, isExpandable } from "./expansion";
import type { SessionRecord } from "../session/types";

function toggleAt(
  state: UIState,
  index: number,
  persist?: (record: SessionRecord) => void,
): void {
  const item = state.chat[index];
  if (!isExpandable(item)) return;
  const expanded = !(item.expanded ?? defaultExpanded(item));
  state.chat[index] = {
    ...item,
    expanded,
  };
  state.chatVersion += 1;
  if (item.kind === "skill") {
    persist?.({
      ts: Date.now(),
      turnId: item.turnId,
      type: "skill",
      payload: { name: item.skillName, content: item.content, expanded },
    });
  }
}

export function toggleToolExpand(
  state: UIState,
  index: number | undefined,
  bump: () => void,
  persist?: (record: SessionRecord) => void,
): void {
  if (index !== undefined) {
    toggleAt(state, index, persist);
    bump();
    return;
  }
  const latestTurnItem = [...state.chat]
    .reverse()
    .find(
      (item) =>
        item.kind === "assistant" ||
        item.kind === "thinking" ||
        item.kind === "tool" ||
        item.kind === "skill",
    );
  const latestTurnId = latestTurnItem?.turnId;
  let candidate: number | undefined;
  for (let i = state.chat.length - 1; i >= 0; i--) {
    if (
      latestTurnId
        ? state.chat[i].turnId !== latestTurnId
        : state.chat[i] !== latestTurnItem
    )
      continue;
    if (!isExpandable(state.chat[i])) continue;
    candidate = i;
    break;
  }
  if (candidate !== undefined) {
    toggleAt(state, candidate, persist);
    bump();
  }
}
