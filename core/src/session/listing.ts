import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { readSessionRecords } from "./records";
import type { SessionRecord, SessionSummary } from "./types";

function indexFile(file: string): string {
  return file.replace(/\.jsonl$/, ".index.json");
}

export function sessionDirectory(dir?: string): string {
  return dir ?? path.join(os.homedir(), ".cagent", "sessions");
}

function countUserMessages(file: string): number {
  try {
    return fs
      .readFileSync(file, "utf8")
      .split("\n")
      .filter(Boolean)
      .reduce((count, line) => {
        try {
          return (
            count +
            ((JSON.parse(line) as SessionRecord).type === "user" ? 1 : 0)
          );
        } catch {
          return count;
        }
      }, 0);
  } catch {
    return 0;
  }
}

export function listSessions(dir?: string): SessionSummary[] {
  const base = sessionDirectory(dir);
  if (!fs.existsSync(base)) return [];
  return fs
    .readdirSync(base)
    .filter((file) => file.endsWith(".jsonl"))
    .map((name) => readSessionIndex(path.join(base, name), name))
    .filter((summary): summary is SessionSummary => summary !== null)
    .sort((a, b) => b.updated.localeCompare(a.updated));
}

export function updateSessionIndex(file: string, record: SessionRecord): void {
  const name = path.basename(file);
  let summary = readIndex(file);
  if (!summary) {
    summary = summarizeSession(file, name);
    if (summary) fs.writeFileSync(indexFile(file), JSON.stringify(summary));
    return;
  }
  if (record.type === "user") {
    const content = String(record.payload.content ?? "");
    if (!summary.title) summary.title = content;
    summary.messageCount += 1;
  }
  if (record.type === "meta" && record.payload.kind === "title")
    summary.title = String(record.payload.title ?? "") || summary.title;
  if (record.type === "meta" && record.payload.kind === "project") {
    if (typeof record.payload.cwd === "string")
      summary.cwd = record.payload.cwd;
    if (typeof record.payload.branch === "string")
      summary.branch = record.payload.branch;
  }
  summary.updated = new Date(record.ts).toISOString();
  fs.writeFileSync(indexFile(file), JSON.stringify(summary));
}

function readSessionIndex(file: string, name: string): SessionSummary | null {
  const index = readIndex(file);
  if (index) return index;
  const summary = summarizeSession(file, name);
  if (summary) fs.writeFileSync(indexFile(file), JSON.stringify(summary));
  return summary;
}

function readIndex(file: string): SessionSummary | null {
  try {
    const value = JSON.parse(
      fs.readFileSync(indexFile(file), "utf8"),
    ) as SessionSummary;
    return typeof value.id === "string" &&
      typeof value.updated === "string" &&
      typeof value.title === "string" &&
      typeof value.messageCount === "number"
      ? value
      : null;
  } catch {
    return null;
  }
}

export function projectRoot(cwd = process.cwd()): string {
  const result = requireGitRoot(cwd);
  return result ?? path.resolve(cwd);
}

function requireGitRoot(cwd: string): string | null {
  const result = spawnSync("git", ["-C", cwd, "rev-parse", "--show-toplevel"], {
    encoding: "utf8",
  });
  return result.status === 0 ? result.stdout.trim() : null;
}

export function latestUserMessage(dir?: string): string | null {
  const base = sessionDirectory(dir);
  if (!fs.existsSync(base)) return null;
  let latest: { ts: number; content: string } | null = null;
  for (const file of fs
    .readdirSync(base)
    .filter((name) => name.endsWith(".jsonl"))) {
    for (const record of readSessionRecords(path.join(base, file))) {
      if (record.type !== "user") continue;
      const content = String(record.payload.content ?? "");
      if (content && (!latest || record.ts >= latest.ts))
        latest = { ts: record.ts, content };
    }
  }
  return latest?.content ?? null;
}

function summarizeSession(file: string, name: string): SessionSummary | null {
  const stats = fs.statSync(file);
  const records = readSessionRecords(file);
  const firstUser = firstUserMessage(records);
  if (!firstUser) return null;
  const title = sessionTitle(records) || firstUser;
  const project = projectMeta(records);
  return {
    id: name.slice(0, -6),
    updated: stats.mtime.toISOString(),
    title,
    messageCount: countUserMessages(file),
    cwd: project?.cwd,
    branch: project?.branch,
  };
}

function firstUserMessage(records: SessionRecord[]): string {
  const record = records.find((entry) => entry.type === "user");
  return String(record?.payload.content ?? "");
}

function sessionTitle(records: SessionRecord[]): string {
  const record = records.findLast(
    (entry) => entry.type === "meta" && entry.payload.kind === "title",
  );
  return String(record?.payload.title ?? "");
}

function projectMeta(
  records: SessionRecord[],
): { cwd?: string; branch?: string } | null {
  const record = records.find(
    (entry) =>
      entry.type === "meta" &&
      entry.payload.kind === "project" &&
      typeof entry.payload.cwd === "string",
  );
  if (!record) return null;
  return {
    cwd: String(record.payload.cwd),
    branch:
      typeof record.payload.branch === "string"
        ? String(record.payload.branch)
        : undefined,
  };
}
