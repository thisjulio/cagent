import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { projectIdentity } from "./project-identity";
export { projectIdentity } from "./project-identity";

export type MemoryScope = "project" | "user";
export type MemoryKind = "convention" | "decision" | "preference" | "fact";
export type MemoryStatus = "pending" | "approved" | "ignored" | "archived";
export type MemoryEntry = {
  id: string; content: string; scope: MemoryScope; kind: MemoryKind; status: MemoryStatus;
  confidence: number; source: string; project?: string; conflict?: boolean; supersedes?: string;
  normalizedText?: string; embeddingModel?: string; embeddingDimension?: number; embedding?: number[];
  createdAt: string; updatedAt: string;
};

export function storageFile(config: Record<string, unknown>): string {
  const configured = typeof config.path === "string" ? config.path : undefined;
  return configured ? path.resolve(configured) : path.join(os.homedir(), ".cagent", "memory-local.json");
}

export function loadEntries(file: string): MemoryEntry[] {
  try { const parsed = JSON.parse(fs.readFileSync(file, "utf8")); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}

export function saveEntries(file: string, entries: MemoryEntry[]): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(entries, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, file);
}

export function scoped(entry: MemoryEntry, scope: MemoryScope | undefined, project: string): boolean {
  return (!scope || entry.scope === scope) && (entry.scope === "user" || entry.project === project);
}
