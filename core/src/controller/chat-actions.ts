import type { UIState } from "./state";
import { defaultExpanded, isExpandable } from "./expansion";

export function toggleToolExpand(
  state: UIState,
  index: number | undefined,
  bump: () => void,
): void {
  if (index !== undefined) {
    if (!isExpandable(state.chat[index])) return;
    state.chat[index] = {
      ...state.chat[index],
      expanded: !(
        state.chat[index].expanded ?? defaultExpanded(state.chat[index])
      ),
    };
    bump();
    return;
  }
  const latestTurnItem = [...state.chat]
    .reverse()
    .find(
      (item) =>
        item.kind === "assistant" ||
        item.kind === "thinking" ||
        item.kind === "tool",
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
    const i = candidate;
    state.chat[i] = {
      ...state.chat[i],
      expanded: !(state.chat[i].expanded ?? defaultExpanded(state.chat[i])),
    };
    bump();
  }
}
