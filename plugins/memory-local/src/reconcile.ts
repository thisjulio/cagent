import crypto from "node:crypto";
import fs from "node:fs";
import type { MemoryEntry } from "./storage";
import type { SqliteStore } from "./sqlite-storage";

export function reconcileMemories(store: SqliteStore): number {
  let invalidated = 0;
  for (const entry of store.entries()) {
    if (entry.scope !== "project" || !entry.evidence?.length || entry.status === "archived") continue;
    const changed = entry.evidence.some((evidence) => evidence.kind === "code" && changedSinceCreation(evidence.path, entry.createdAt));
    if (changed && !entry.invalidatedAt) {
      store.replace({ ...entry, status: "ignored", conflict: true, invalidatedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      invalidated++;
    }
  }
  return invalidated;
}

function changedSinceCreation(file: string, createdAt: string): boolean {
  try { return fs.statSync(file).mtimeMs > Date.parse(createdAt) + 1000; } catch { return true; }
}

function supersede(store: SqliteStore, oldEntry: MemoryEntry, replacement: MemoryEntry): void {
  const id = crypto.randomUUID();
  store.replace({ ...replacement, id, supersedes: oldEntry.id });
  store.replace({ ...oldEntry, status: "ignored", conflict: false, invalidatedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
}
