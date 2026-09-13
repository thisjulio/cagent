import type { MemoryEntry, MemoryScope } from "./storage";

export type SearchOptions = { limit?: number; scope?: MemoryScope; minScore?: number };
export type SearchHit = { entry: MemoryEntry; score: number; lexical: number };

export function searchEntries(entries: MemoryEntry[], query: string, project: string, options: SearchOptions = {}): MemoryEntry[] {
  return rankEntries(entries, query, project, options).map((hit) => hit.entry);
}

export function rankEntries(entries: MemoryEntry[], query: string, project: string, options: SearchOptions = {}): SearchHit[] {
  const terms = tokenize(query);
  return entries.filter((entry) => eligible(entry, project, options.scope))
    .map((entry) => { const lexical = score(entry.content, terms); return { entry, lexical, score: lexical / Math.max(1, terms.length) }; })
    .filter((hit) => hit.score >= (options.minScore ?? 0.01))
    .sort((a, b) => b.score - a.score || a.entry.createdAt.localeCompare(b.entry.createdAt))
    .slice(0, options.limit ?? 5);
}

function eligible(entry: MemoryEntry, project: string, scope?: MemoryScope): boolean {
  return entry.status === "approved" && !entry.conflict && (!scope || entry.scope === scope) && (entry.scope === "user" || entry.project === project);
}
function tokenize(value: string): string[] { return [...new Set(value.toLocaleLowerCase().match(/[\p{L}\p{N}_/-]+/gu) ?? [])]; }
function score(content: string, terms: string[]): number { const words = tokenize(content); return terms.reduce((total, term) => total + (words.includes(term) ? 1 : 0), 0); }
