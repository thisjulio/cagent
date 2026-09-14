import type { ChatItem, UIState } from "./state";

export const MAX_CHAT_ITEMS = 400;

export function appendChat(state: UIState, item: ChatItem): void {
  if (item.timestamp === undefined) item.timestamp = Date.now();
  state.chat.push(item);
  if (state.chat.length <= MAX_CHAT_ITEMS) return;
  state.chat.splice(0, state.chat.length - MAX_CHAT_ITEMS);
  state.chatVersion += 1;
}

export function appendToolLog(state: UIState, tool: UIState["toolLog"][number]): void {
  state.toolLog.push(tool);
  if (state.toolLog.length > MAX_CHAT_ITEMS) state.toolLog.splice(0, state.toolLog.length - MAX_CHAT_ITEMS);
}
