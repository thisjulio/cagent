import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Message } from "@cagent/sdk";

export type SessionRecord = {
  ts: number;
  type: "user" | "assistant" | "thinking" | "tool" | "meta";
  payload: Record<string, unknown>;
};

export class Session {
  readonly id: string;
  readonly file: string;

  constructor(id?: string, dir?: string) {
    const base = dir ?? path.join(os.homedir(), ".cagent", "sessions");
    fs.mkdirSync(base, { recursive: true });
    if (id) {
      this.id = id;
      this.file = path.join(base, `${id}.jsonl`);
      return;
    }
    this.id = crypto.randomUUID();
    this.file = path.join(base, `${this.id}.jsonl`);
  }

  append(rec: SessionRecord): void {
    fs.appendFileSync(this.file, JSON.stringify(rec) + "\n");
  }

  load(): { records: SessionRecord[]; messages: Message[] } {
    if (!fs.existsSync(this.file)) return { records: [], messages: [] };
    const records = fs
      .readFileSync(this.file, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as SessionRecord);
    const compacted = records.findLastIndex((r) => r.type === "meta" && r.payload.kind === "compacted");
    const effective = compacted === -1
      ? records
      : [...records.slice(0, compacted).filter((r) => r.type === "meta" && r.payload.kind === "title"), ...records.slice(compacted)];
    const messages: Message[] = [];
    for (const r of effective) {
      const p = r.payload;
      if (r.type === "meta" && p.kind === "skill-activated") {
        if (p.format !== "tool-v1") messages.push({ role: "system", content: skillMessage(p) });
      } else if (r.type === "meta" && p.kind === "compacted") {
        messages.push({ role: "user", content: `[previous conversation summary]\n${String(p.summary ?? "")}` });
      } else if (r.type === "user") {
        messages.push({ role: "user", content: String(p.content ?? "") });
      } else if (r.type === "assistant") {
        messages.push({
          role: "assistant",
          content: String(p.content ?? ""),
          ...(p.tool_calls ? { tool_calls: p.tool_calls } : {}),
        });
      } else if (r.type === "tool") {
        messages.push({ role: "tool", tool_call_id: String(p.tool_call_id ?? ""), content: String(p.content ?? "") });
      }
    }
    return { records: effective, messages };
  }

  static list(dir?: string): { id: string; updated: string; title: string }[] {
    const base = dir ?? path.join(os.homedir(), ".cagent", "sessions");
    if (!fs.existsSync(base)) return [];
    return fs
      .readdirSync(base)
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => {
        const file = path.join(base, f);
        const stats = fs.statSync(file);
        const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean).slice(0, 100);
        let firstUser = "";
        let title = "";
        for (const l of lines) {
          try {
            const r = JSON.parse(l) as SessionRecord;
            if (r.type === "meta" && r.payload.kind === "title" && !title) title = String(r.payload.title ?? "");
            else if (r.type === "user" && !firstUser) firstUser = String(r.payload.content ?? "");
          } catch {
            // Ignore invalid lines.
          }
        }
        return { id: f.slice(0, -6), updated: stats.mtime.toISOString(), title: (title || firstUser || "(empty)").slice(0, 60) };
      })
      .sort((a, b) => b.updated.localeCompare(a.updated));
  }
}

function skillMessage(payload: Record<string, unknown>): string {
  if (payload.format !== "skill-content-v1") {
    return [
      "<skill>",
      `<name>${String(payload.name ?? "")}</name>`,
      `<source>${String(payload.source ?? "user")}</source>`,
      "</skill>",
      "",
      String(payload.content ?? ""),
    ].join("\n");
  }
  return [
    `<skill_content name="${String(payload.name ?? "")}" source="${String(payload.source ?? "user")}">`,
    "Follow this explicitly activated skill before answering the user's task.",
    "",
    String(payload.content ?? "").trim(),
    "",
    "</skill_content>",
  ].join("\n");
}

export function estimateTokens(messages: Message[]): number {
  return Math.ceil(
    messages.reduce(
      (n, m) => n + m.content.length + (m.tool_calls ? JSON.stringify(m.tool_calls).length : 0),
      0,
    ) / 4,
  );
}

export function serializeMessages(messages: Message[]): string {
  return messages.map((m) => `${m.role}: ${m.content}`).join("\n");
}
