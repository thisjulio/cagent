import type { ChatItem, UIState } from "./state";
import { appendChat, appendToolLog } from "./chat-buffer";
import { appendCapped, MAX_VISIBLE_STREAM_CHARS } from "../stream-buffer";
import { classifyTool } from "../tool-category";
import { ensureToolTitle } from "../tool-title";
import { toolCommandLabel } from "./tool-label";

function lastRunningChat(chat: ChatItem[], tool: string): ChatItem | undefined {
  for (let i = chat.length - 1; i >= 0; i--) {
    if (chat[i].kind === "tool" && chat[i].toolName === tool && chat[i].running)
      return chat[i];
  }
  return undefined;
}

export function toolPre(state: UIState, p: unknown): void {
  const { tool, args, title } = p as {
    tool: string;
    args: Record<string, unknown>;
    title?: string;
  };
  const cmd = toolCommandLabel(tool, args);
  const toolTitle = ensureToolTitle(title, tool);
  appendChat(state, {
    kind: "tool",
    toolName: tool,
    title: toolTitle,
    toolCategory: classifyTool(tool),
    cmd,
    running: true,
    startedAt: Date.now(),
    content: "",
  });
  appendToolLog(state, { tool, cmd, running: true });
}

export function toolStream(state: UIState, p: unknown, prefix = ""): void {
  const { tool, chunk } = p as { tool: string; chunk: string };
  const e = lastRunningChat(state.chat, tool);
  if (e)
    e.content = appendCapped(
      e.content ?? "",
      prefix + chunk,
      MAX_VISIBLE_STREAM_CHARS,
    );
}

export function toolPost(state: UIState, p: unknown): void {
  const { tool, result, error } = p as {
    tool: string;
    result?: {
      output: string;
      isError?: boolean;
      display?: import("@cagent/sdk").ToolDisplay;
      changesWorkspace?: boolean;
    };
    error?: string;
  };
  const e = lastRunningChat(state.chat, tool);
  if (e) {
    e.running = false;
    if (e.startedAt) e.durationMs = Date.now() - e.startedAt;
    e.isError = !!error || result?.isError === true;
    e.changesWorkspace = result?.changesWorkspace === true;
    e.display = result?.display;
    if (!e.content) e.content = error ?? result?.output ?? "";
  }
}

export function toolDenied(state: UIState, p: unknown): void {
  const { tool, args, title } = p as {
    tool: string;
    args: Record<string, unknown>;
    title?: string;
  };
  const cmd = toolCommandLabel(tool, args);
  const toolTitle = ensureToolTitle(title, tool);
  appendChat(state, {
    kind: "tool",
    toolName: tool,
    title: toolTitle,
    toolCategory: classifyTool(tool),
    cmd,
    denied: true,
    isError: true,
    running: false,
    content: "user denied",
  });
  appendToolLog(state, { tool, cmd, denied: true });
}
