import type { ChatItem, UIState } from "./state";
import { appendChat, appendToolLog } from "./chat-buffer";
import { appendCapped, MAX_VISIBLE_STREAM_CHARS } from "../stream-buffer";

function lastRunningChat(chat: ChatItem[], tool: string): ChatItem | undefined {
  for (let i = chat.length - 1; i >= 0; i--) {
    if (chat[i].kind === "tool" && chat[i].toolName === tool && chat[i].running) return chat[i];
  }
  return undefined;
}

export function toolPre(state: UIState, p: unknown): void {
  const { tool, args } = p as { tool: string; args: Record<string, unknown> };
  const cmd = typeof args.command === "string" ? args.command : JSON.stringify(args);
  appendChat(state, { kind: "tool", toolName: tool, cmd, running: true, content: "" });
  appendToolLog(state, { tool, cmd, running: true });
}

export function toolStream(state: UIState, p: unknown, prefix = ""): void {
  const { tool, chunk } = p as { tool: string; chunk: string };
  const e = lastRunningChat(state.chat, tool);
  if (e) e.content = appendCapped(e.content ?? "", prefix + chunk, MAX_VISIBLE_STREAM_CHARS);
}

export function toolPost(state: UIState, p: unknown): void {
  const { tool, result, error } = p as { tool: string; result?: { output: string }; error?: string };
  const e = lastRunningChat(state.chat, tool);
  if (e) {
    e.running = false;
    e.isError = !!error;
    if (!e.content) e.content = error ?? result?.output ?? "";
  }
}

export function toolDenied(state: UIState, p: unknown): void {
  const { tool, args } = p as { tool: string; args: Record<string, unknown> };
  const cmd = typeof args.command === "string" ? args.command : JSON.stringify(args);
  appendChat(state, { kind: "tool", toolName: tool, cmd, denied: true, isError: true, running: false, content: "usuário negou" });
  appendToolLog(state, { tool, cmd, denied: true });
}
