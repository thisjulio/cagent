import { streamOnce } from "../loop";
import { Session, estimateTokens, serializeMessages } from "../session";
import { splitRoute } from "../route";
import type { ChatItem } from "./state";
import type { Controller } from "./controller";
import { appendChat, MAX_CHAT_ITEMS } from "./chat-buffer";
import { mergeSystemMessages } from "../message-context";
import { classifyTool } from "../tool-category";
import { restoreTasks } from "../tasks";

type LoadedRecord = { ts: number; type: "user" | "assistant" | "thinking" | "tool" | "meta"; payload: Record<string, unknown> };

export function toChatItems(records: LoadedRecord[]): ChatItem[] {
  return records.flatMap((r) => {
    const p = r.payload as Record<string, unknown>;
    if (r.type === "user") return [{ kind: "user", content: String(p.content ?? ""), timestamp: r.ts }];
    if (r.type === "assistant") {
      const content = String(p.content ?? "");
      const subagent = typeof p.subagent === "string" ? p.subagent : undefined;
      return content ? [{ kind: "assistant", content, subagent, timestamp: r.ts }] : [];
    }
    if (r.type === "thinking") {
      const content = String(p.content ?? "");
      return content ? [{ kind: "thinking", content, timestamp: r.ts }] : [];
    }
    if (r.type === "tool") {
      const toolName = p.toolName ? String(p.toolName) : String(p.tool_call_id ?? "");
      return [{ kind: "tool", content: String(p.content ?? ""), toolName, toolCategory: classifyTool(toolName) }];
    }
    if (p.kind === "subagent-start") return [{ kind: "assistant", content: "", subagent: String(p.name ?? ""), subagentHeader: true, timestamp: r.ts }];
    if (p.kind === "skill-activated") return p.format === "tool-v1" ? [] : [{ kind: "meta", content: `skill activated: ${String(p.name ?? "")}` }];
    if (p.kind === "compacted") return [{ kind: "meta", content: "conversation compacted" }];
    return [];
  });
}

function sanitizeTitle(value: string): string {
  return value
    .trim()
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .replace(/^#{1,6}\s+/, "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/(^|[\s(])([*_~`]+)(?=\S)/g, "$1")
    .replace(/(\S)([*_~`]+)(?=[\s).,!?:;]|$)/g, "$1")
    .replace(/^\s*[-+*>]\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function toTitle(records: LoadedRecord[]): string {
  const rec = records.find((r) => r.type === "meta" && (r.payload as Record<string, unknown>).kind === "title");
  return rec ? sanitizeTitle(String((rec.payload as Record<string, unknown>).title ?? "")) : "";
}

export function startNewSession(c: Controller): void {
  c.session = new Session(undefined, c.deps.sessionDir);
  c.messages = [{ role: "system" as const, content: c.deps.systemPrompt }];
  c.interrupted = false;
  const s = c.state;
  s.chat = [];
  s.tasks = [];
  s.chatVersion += 1;
  s.toolLog = [];
  s.title = "";
  s.busy = false;
  s.turnStartedAt = null;
  s.elapsedMs = 0;
  s.input = "";
  s.inputKey += 1;
  s.suggest = [];
  s.suggestIdx = -1;
  s.notice = "";
  s.pendingAsk = null;
  s.modelPicker = null;
  s.sessionList = null;
  s.tokens = estimateTokens(c.messages);
  c.bump();
}

export function restoreSession(c: Controller, id: string): void {
  const entry = c.state.sessionList?.find((x) => x.id === id);
  if (!entry) return;
  const session = new Session(id, c.deps.sessionDir);
  const loaded = session.load();
  c.session = session;
  c.messages = mergeSystemMessages(c.deps.systemPrompt, loaded.messages);
  c.state.chat = toChatItems(loaded.records).slice(-MAX_CHAT_ITEMS);
  c.state.tasks = restoreTasks(loaded.records);
  c.state.chatVersion += 1;
  c.state.title = toTitle(loaded.records);
  c.state.notice = `restaurado ${id}`;
  c.state.sessionList = null;
  c.state.input = "";
  c.state.inputKey += 1;
  c.state.suggest = [];
  c.state.suggestIdx = -1;
  c.state.tokens = estimateTokens(c.messages);
  c.bump();
}

export function openSessions(c: Controller): void {
  c.state.sessionList = Session.list();
  c.bump();
}

export function renameSession(c: Controller, name: string): void {
  const s = c.state;
  if (!name) {
    s.notice = "usage: /rename <title>";
    c.bump();
    return;
  }
  s.title = sanitizeTitle(name).slice(0, 60);
  c.session.append({ ts: Date.now(), type: "meta", payload: { kind: "title", title: s.title } });
  s.notice = "";
  c.bump();
}

export async function generateTitle(c: Controller, msg: string): Promise<string> {
  try {
    const { text } = await streamOnce({
      adapter: c.adapter,
      model: splitRoute(c.state.model)[1],
      messages: [
        {
          role: "system",
          content:
            "Create a concise, specific conversation title in Title Case, using 3–6 words. Capture the user's main goal or topic, not the wording of the request. Prefer an action plus an object when appropriate (for example, 'Improve Session Titles' or 'Debug Login Timeout'). Reply with only the title on one line: no Markdown, labels, explanation, sentence-ending punctuation, or quotation marks.",
        },
        { role: "user", content: msg },
      ],
      tools: [],
      attempts: 1,
      interrupted: () => c.interrupted,
    });
    const t = sanitizeTitle(text);
    if (t) return t.slice(0, 60);
  } catch {
    // Fallback when the LLM fails or the user interrupts.
  }
  const fallback = sanitizeTitle(msg);
  return fallback.length > 40 ? fallback.slice(0, 40) + "…" : fallback;
}

export async function compact(c: Controller): Promise<void> {
  const s = c.state;
  const threshold = s.threshold;
  const est = estimateTokens(c.messages);
  if (est < threshold) {
    s.notice = `no compaction (${est} < ${threshold} tokens)`;
    c.bump();
    return;
  }
  const keep = 10;
  if (c.messages.length <= keep + 1) {
    s.notice = "(not enough to compact)";
    c.bump();
    return;
  }
  const old = c.messages.slice(1, c.messages.length - keep);
  s.notice = "compacting context... Esc interrupts";
  c.bump();
  // Let OpenTUI paint the progress state before serializing a large history.
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  if (c.interrupted) {
    s.notice = "compaction interrupted";
    c.bump();
    return;
  }
  const { text: summary } = await streamOnce({
    adapter: c.adapter,
    model: splitRoute(s.model)[1],
    messages: [
      {
        role: "system",
        content:
          "Summarize the conversation below in at most 5 lines, preserving decisions, executed commands, and relevant results.",
      },
      { role: "user", content: serializeMessages(old) },
    ],
    tools: [],
    interrupted: () => c.interrupted,
  });
  if (c.interrupted) {
    s.notice = "compaction interrupted";
    c.bump();
    return;
  }
  const rest = c.messages.slice(c.messages.length - keep);
  c.messages.length = 1;
  c.messages.push({ role: "user", content: `[previous conversation summary]\n${summary}` }, ...rest);
  c.session.append({ ts: Date.now(), type: "meta", payload: { kind: "compacted", summary } });
  appendChat(s, { kind: "meta", content: `compacted: ${est} -> ${estimateTokens(c.messages)} tokens` });
  s.tokens = estimateTokens(c.messages);
  c.bump();
}
