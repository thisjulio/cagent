import type { UIState } from "./state";

export function toggleToolExpand(state: UIState, index: number | undefined, bump: () => void): void {
  if (index !== undefined) {
    if (state.chat[index]?.kind !== "tool") return;
    state.chat[index] = { ...state.chat[index], expanded: !state.chat[index].expanded };
    bump();
    return;
  }
  for (let i = state.chat.length - 1; i >= 0; i--) {
    if (state.chat[i].kind !== "tool") continue;
    state.chat[i] = { ...state.chat[i], expanded: !state.chat[i].expanded };
    bump();
    return;
  }
}
