import type { Controller } from "./controller";
import { notify } from "./chat-buffer";

export function openToolViewer(
  controller: Controller,
  direction: "forward" | "backward" = "forward",
  turnId?: string,
): boolean {
  const tools = controller.state.chat
    .map((item, chatIndex) => ({ item, chatIndex }))
    .filter(
      ({ item }) =>
        item.kind === "tool" &&
        !item.running &&
        item.changesWorkspace === true &&
        (!turnId || item.turnId === turnId),
    );
  if (!tools.length) {
    notify(controller.state, "no file changes yet");
    return false;
  }
  const currentIndex = tools.findIndex(
    ({ chatIndex }) => chatIndex === controller.state.toolViewerChatIndex,
  );
  const selectedIndex =
    currentIndex < 0
      ? tools.length - 1
      : direction === "forward"
        ? (currentIndex - 1 + tools.length) % tools.length
        : (currentIndex + 1) % tools.length;
  controller.state.toolViewerIndex = selectedIndex;
  controller.state.toolViewerTurnId = turnId;
  const selected = tools[selectedIndex];
  controller.state.toolViewerChatIndex = selected.chatIndex;
  controller.observability?.recordEvent("tool.diff_viewed", {
    index: selectedIndex,
    "tool.name": selected.item.toolName ?? "unknown",
    session_id: controller.state.sessionId,
  });
  controller.bump();
  return true;
}

export function closeToolViewer(controller: Controller): void {
  controller.state.toolViewerIndex = null;
  controller.state.toolViewerTurnId = undefined;
  controller.state.toolViewerChatIndex = undefined;
  controller.bump();
}
