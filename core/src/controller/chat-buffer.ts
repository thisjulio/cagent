import crypto from "node:crypto";
import type { ChatItem, UIState } from "./state";

export const MAX_CHAT_ITEMS = 400;
export const MAX_TOOL_LOG_ITEMS = 400;

export function appendChat(state: UIState, item: ChatItem): void {
  item.id ??= crypto.randomUUID();
  if (item.timestamp === undefined) item.timestamp = Date.now();
  if (state.currentTurnId && !item.turnId) item.turnId = state.currentTurnId;
  state.chat.push(item);
  if (state.chat.length > MAX_CHAT_ITEMS)
    state.chat.splice(0, state.chat.length - MAX_CHAT_ITEMS);
  // ponytail: chat is mutated in place, so the version is the only cheap
  // signal the UI can memoize on; bump it on every append.
  state.chatVersion += 1;
}

export function appendToolLog(
  state: UIState,
  tool: UIState["toolLog"][number],
): void {
  state.toolLog.push(tool);
  if (state.toolLog.length > MAX_TOOL_LOG_ITEMS)
    state.toolLog.splice(0, state.toolLog.length - MAX_TOOL_LOG_ITEMS);
}

export function notify(state: UIState, message: string): void {
  state.notice = message;
  appendChat(state, { kind: "meta", content: message });
}
