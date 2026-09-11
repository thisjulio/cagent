import type { ChatItem, ToolLogEntry, UIState } from "./state";

function lastRunningChat(chat: ChatItem[], tool: string): ChatItem | undefined {
  for (let i = chat.length - 1; i >= 0; i--) {
    if (chat[i].kind === "tool" && chat[i].toolName === tool && chat[i].running) return chat[i];
  }
  return undefined;
}

function lastRunningLog(log: ToolLogEntry[], tool: string): ToolLogEntry | undefined {
  for (let i = log.length - 1; i >= 0; i--) {
    if (log[i].tool === tool && log[i].running) return log[i];
  }
  return undefined;
}

export function toolPre(state: UIState, p: unknown): void {
  const { tool, args } = p as { tool: string; args: Record<string, unknown> };
  const cmd = typeof args.command === "string" ? args.command : JSON.stringify(args);
  state.chat.push({ kind: "tool", toolName: tool, cmd, running: true, content: "" });
  state.toolLog.push({ tool, cmd, running: true });
}

export function toolStream(state: UIState, p: unknown, prefix = ""): void {
  const { tool, chunk } = p as { tool: string; chunk: string };
  const e = lastRunningChat(state.chat, tool);
  if (e) e.content = (e.content ?? "") + prefix + chunk;
  const side = lastRunningLog(state.toolLog, tool);
  if (side) side.output = (side.output ?? "") + prefix + chunk;
}

export function toolPost(state: UIState, p: unknown): void {
  const { tool, result, error } = p as { tool: string; result?: { output: string }; error?: string };
  const e = lastRunningChat(state.chat, tool);
  if (e) {
    e.running = false;
    e.isError = !!error;
    if (!e.content) e.content = error ?? result?.output ?? "";
  }
  const side = lastRunningLog(state.toolLog, tool);
  if (side) {
    side.running = false;
    side.output = error ?? result?.output ?? "";
    side.isError = !!error;
  }
}

export function toolDenied(state: UIState, p: unknown): void {
  const { tool, args } = p as { tool: string; args: Record<string, unknown> };
  const cmd = typeof args.command === "string" ? args.command : JSON.stringify(args);
  state.chat.push({ kind: "tool", toolName: tool, cmd, denied: true, isError: true, running: false, content: "usuário negou" });
  state.toolLog.push({ tool, cmd, denied: true });
}
