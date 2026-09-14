import { Session, estimateTokens } from "../session";
import type { ChatItem } from "./state";
import type { Controller } from "./controller";
import { MAX_CHAT_ITEMS } from "./chat-buffer";
import { mergeSystemMessages } from "../message-context";
import { classifyTool } from "../tool-category";
import { restoreTasks } from "../tasks";
export { compact } from "./compaction";

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

function summaryForDisplay(previous: string, chunk: string): string {
  const marker = "\n\n";
  const current = previous.split(marker)[1] ?? "";
  return `${current}${chunk}`.slice(-6000);
}

function boundedCompactionInput(messages: Controller["messages"], toolLimit: number): Controller["messages"] {
  return messages.map((message) => {
    if (message.role !== "tool" || typeof message.content !== "string" || message.content.length <= toolLimit * 4) return message;
    return { ...message, content: `${message.content.slice(0, toolLimit * 4)}\n[older tool output pruned]` };
  });
}

function removeOrphanedToolOutputs(messages: Controller["messages"]): Controller["messages"] {
  const firstMessage = messages.findIndex((message) => message.role !== "tool");
  return firstMessage === -1 ? [] : messages.slice(firstMessage);
}

export function sanitizeTitle(value: string): string {
  return value
    .trim()
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, "")
    .replace(/<tool_call>[\s\S]*$/gi, "")
    .replace(/^\s*\{?\s*"?(?:name|tool)\s*"\s*:\s*"[^"]+"[\s\S]*$/i, "")
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .replace(/^#{1,6}\s+/, "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/(^|[\s(])([*_~`]+)(?=\S)/g, "$1")
    .replace(/(\S)([*_~`]+)(?=[\s).,!?:;]|$)/g, "$1")
    .replace(/^\s*[-+*>]\s+/, "")
    .replace(/^I'll\s+/i, "")
    .replace(/^I will\s+/i, "")
    .replace(/^Let me\s+/i, "")
    .replace(/^Sure,\s+/i, "")
    .replace(/^OK,\s+/i, "")
    .replace(/^Alright,\s+/i, "")
    .replace(/^Here is\s+/i, "")
    .replace(/^Here's\s+/i, "")
    .replace(/^Got it,\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function toTitle(records: LoadedRecord[]): string {
  const rec = records.find((r) => r.type === "meta" && (r.payload as Record<string, unknown>).kind === "title");
  return rec ? sanitizeTitle(String((rec.payload as Record<string, unknown>).title ?? "")) : "";
}

export function startNewSession(c: Controller): void {
  c.observability?.recordEvent("session.created");
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
  c.observability?.recordEvent("session.resumed", { "message.count": loaded.messages.length });
  c.bump();
}

export function openSessions(c: Controller): void {
  c.state.sessionList = Session.list();
  c.observability?.recordEvent("session_picker.opened", { "session.count": c.state.sessionList.length });
  c.observability?.recordEvent("session.listed", { "session.count": c.state.sessionList.length });
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
  c.observability?.recordEvent("session.renamed", { "title.length": s.title.length });
  c.session.append({ ts: Date.now(), type: "meta", payload: { kind: "title", title: s.title } });
  s.notice = "";
  c.bump();
}

export async function generateTitle(c: Controller, msg: string): Promise<string> {
  c.observability?.recordEvent("title_generation.started", { "input.length": msg.length });
  try {
    const { text } = await streamOnce({
      adapter: c.adapter,
      model: splitRoute(c.state.model)[1],
      messages: [
        {
          role: "system",
          content:
            "You are a title generator. Your ONLY job is to generate a short title for the conversation opener below. Do NOT answer the question or respond to the content. Do NOT provide any information, facts, or responses to what is asked. Just generate a 3-6 word Title Case title that describes the topic. Examples: 'Commit Git Changes', 'Debug Login Timeout', 'Improve Session Titles', 'Check Current Date'. Output ONLY the title text, nothing else.",
        },
        { role: "user", content: `Conversation opener to title (do NOT answer it):\n"${msg}"\n\nTitle:` },
      ],
      tools: [],
      attempts: 1,
      interrupted: () => c.interrupted,
    });
    const t = sanitizeTitle(text);
    if (t) {
      c.observability?.recordEvent("title_generation.completed", { "title.length": Math.min(t.length, 60), fallback: false });
      return t.slice(0, 60);
    }
  } catch {
    c.observability?.recordEvent("title_generation.failed");
    // Fallback when the LLM fails or the user interrupts.
  }
  const fallback = sanitizeTitle(msg);
  c.observability?.recordEvent("title_generation.fallback", { "title.length": Math.min(fallback.length, 40) });
  return fallback.length > 40 ? fallback.slice(0, 40) + "…" : fallback;
}
