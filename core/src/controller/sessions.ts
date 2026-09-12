import { streamOnce } from "../loop";
import { Session, estimateTokens, serializeMessages } from "../session";
import { splitRoute } from "../route";
import type { ChatItem } from "./state";
import type { Controller } from "./controller";
import { appendChat, MAX_CHAT_ITEMS } from "./chat-buffer";

type LoadedRecord = { type: "user" | "assistant" | "tool" | "meta"; payload: Record<string, unknown> };

export function toChatItems(records: LoadedRecord[]): ChatItem[] {
  return records.map((r) => {
    const p = r.payload as Record<string, unknown>;
    if (r.type === "user") return { kind: "user", content: String(p.content ?? "") };
    if (r.type === "assistant") return { kind: "assistant", content: String(p.content ?? "") };
    if (r.type === "tool") return { kind: "tool", content: String(p.content ?? ""), toolName: p.toolName ? String(p.toolName) : String(p.tool_call_id ?? "") };
    return { kind: "meta", content: "meta" };
  });
}

export function toTitle(records: LoadedRecord[]): string {
  const rec = records.find((r) => r.type === "meta" && (r.payload as Record<string, unknown>).kind === "title");
  return rec ? String((rec.payload as Record<string, unknown>).title ?? "") : "";
}

export function startNewSession(c: Controller): void {
  c.session = new Session(undefined, c.deps.sessionDir);
  c.messages = [{ role: "system" as const, content: c.deps.systemPrompt }];
  c.interrupted = false;
  const s = c.state;
  s.chat = [];
  s.chatVersion += 1;
  s.toolLog = [];
  s.title = "";
  s.busy = false;
  s.input = "";
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
  const session = new Session(id);
  const loaded = session.load();
  c.session = session;
  c.messages = [{ role: "system" as const, content: c.deps.systemPrompt }, ...loaded.messages];
  c.state.chat = toChatItems(loaded.records).slice(-MAX_CHAT_ITEMS);
  c.state.chatVersion += 1;
  c.state.title = toTitle(loaded.records);
  appendChat(c.state, { kind: "meta", content: `restaurado ${id}` });
  c.state.sessionList = null;
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
  s.title = name.slice(0, 60);
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
            "Generate a short title (6 words max) for the conversation that starts with the user's message. Reply with only the title, without quotation marks.",
        },
        { role: "user", content: msg },
      ],
      tools: [],
      attempts: 1,
      interrupted: () => c.interrupted,
    });
    const t = text.trim().replace(/^["'“”]+|["'“”]+$/g, "").trim();
    if (t) return t.slice(0, 60);
  } catch {
    // Fallback when the LLM fails or the user interrupts.
  }
  return msg.length > 40 ? msg.slice(0, 40) + "…" : msg;
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
  });
  const rest = c.messages.slice(c.messages.length - keep);
  c.messages.length = 1;
  c.messages.push({ role: "user", content: `[previous conversation summary]\n${summary}` }, ...rest);
  c.session.append({ ts: Date.now(), type: "meta", payload: { kind: "compacted", summary } });
  appendChat(s, { kind: "meta", content: `compacted: ${est} -> ${estimateTokens(c.messages)} tokens` });
  s.tokens = estimateTokens(c.messages);
  c.bump();
}
