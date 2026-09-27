import { appendChat } from "./chat-buffer";
import type { UIState } from "./state";
import { classifyTool } from "../tool-category";

export function startPreparingTool(
  state: UIState,
  toolCall: { id: string; name: string },
): boolean {
  if (classifyTool(toolCall.name) !== "write") return false;
  const label = /edit|patch/i.test(toolCall.name) ? "edit" : "write";
  appendChat(state, {
    kind: "tool",
    toolName: toolCall.name,
    toolCallId: toolCall.id,
    title: `preparing ${label}`,
    toolCategory: "write",
    preparing: true,
    running: true,
    startedAt: Date.now(),
    content: "",
  });
  return true;
}

export function finishPreparingTool(state: UIState, id: string): boolean {
  const index = state.chat.findIndex(
    (item) => item.preparing && item.toolCallId === id,
  );
  if (index < 0) return false;
  state.chat.splice(index, 1);
  state.chatVersion += 1;
  return true;
}
