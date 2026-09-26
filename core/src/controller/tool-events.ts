import type { ChatItem, UIState } from "./state";
import { appendChat, appendToolLog } from "./chat-buffer";
import { appendCapped, MAX_VISIBLE_STREAM_CHARS } from "../stream-buffer";
import { classifyTool } from "../tool-category";
import { ensureToolTitle } from "../tool-title";
import { toolCommandLabel } from "./tool-label";
import { deriveSummary } from "./tool-summary";

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
  const category = classifyTool(tool);
  const toolTitle = ensureToolTitle(title, tool, category, args);
  appendChat(state, {
    kind: "tool",
    toolName: tool,
    title: toolTitle,
    toolCategory: category,
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
      summary?: string;
      isError?: boolean;
      display?: import("@cagent/sdk").ToolDisplay;
      denied?: boolean;
      expanded?: boolean;
      title?: string;
      args?: Record<string, unknown>;
      changesWorkspace?: boolean;
      changedRanges?: Array<{
        path: string;
        startLine: number;
        endLine: number;
      }>;
    };
    error?: string;
  };
  const e = lastRunningChat(state.chat, tool);
  if (e) {
    if (result?.title) e.title = result.title;
    if (result?.args && !e.cmd) {
      e.cmd = toolCommandLabel(tool, result.args);
      e.title = ensureToolTitle(e.title, tool, e.toolCategory, result.args);
    }
    e.running = false;
    if (e.startedAt) e.durationMs = Date.now() - e.startedAt;
    e.isError = !!error || result?.isError === true;
    e.denied = result?.denied === true;
    if (typeof result?.expanded === "boolean") e.expanded = result.expanded;
    e.changesWorkspace = result?.changesWorkspace === true;
    e.changedPaths = result?.changedRanges?.map((range) => range.path);
    if (
      !e.changedPaths?.length &&
      result?.display?.kind === "diff" &&
      result.display.path
    ) {
      e.changedPaths = [result.display.path];
    }
    e.display = result?.display;
    e.summary = result?.summary ?? deriveSummary(e);
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
  const category = classifyTool(tool);
  const toolTitle = ensureToolTitle(title, tool, category, args);
  appendChat(state, {
    kind: "tool",
    toolName: tool,
    title: toolTitle,
    toolCategory: category,
    cmd,
    denied: true,
    isError: true,
    running: false,
    content: "user denied",
  });
  appendToolLog(state, { tool, cmd, denied: true });
}
