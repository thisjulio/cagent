import type { MemoryEntry } from "./storage";

export type RankedMemory = { entry: MemoryEntry; score: number; lexicalRank?: number; vectorRank?: number };
export type HybridOptions = { limit?: number; minScore?: number; maxTokens?: number; queryVector?: number[]; model?: string };

export function hybridRetrieve(entries: MemoryEntry[], query: string, project: string, options: HybridOptions = {}): RankedMemory[] {
  const lexical = entries.filter((entry) => eligible(entry, project)).map((entry) => ({ entry, score: lexicalScore(entry.content, query) })).filter((hit) => hit.score > 0).sort((a, b) => b.score - a.score).slice(0, 50);
  const vector = options.queryVector && options.model ? entries.filter((entry) => eligible(entry, project) && entry.embeddingModel === options.model && entry.embedding?.length === options.queryVector?.length).map((entry) => ({ entry, score: cosine(options.queryVector!, entry.embedding!) })).sort((a, b) => b.score - a.score).slice(0, 50) : [];
  const merged = new Map<string, RankedMemory>();
  lexical.forEach((hit, index) => merged.set(hit.entry.id, { entry: hit.entry, score: 1 / (60 + index + 1), lexicalRank: index + 1 }));
  vector.forEach((hit, index) => { const current = merged.get(hit.entry.id); merged.set(hit.entry.id, { entry: hit.entry, score: (current?.score ?? 0) + 1 / (60 + index + 1), lexicalRank: current?.lexicalRank, vectorRank: index + 1 }); });
  return [...merged.values()].filter((hit) => hit.score >= (options.minScore ?? 0)).sort((a, b) => b.score - a.score || a.entry.id.localeCompare(b.entry.id)).slice(0, options.limit ?? 5).filter((hit) => !options.maxTokens || tokenCount(hit.entry.content) <= options.maxTokens);
}

function eligible(entry: MemoryEntry, project: string): boolean { return entry.status === "approved" && !entry.conflict && (entry.scope === "user" || entry.project === project); }
function lexicalScore(content: string, query: string): number { const terms = query.toLocaleLowerCase().split(/\s+/).filter(Boolean); const value = content.toLocaleLowerCase(); return terms.reduce((total, term) => total + (value.includes(term) ? 1 : 0), 0) / Math.max(1, terms.length); }
function cosine(left: number[], right: number[]): number { let dot = 0; let a = 0; let b = 0; for (let i = 0; i < left.length; i++) { dot += left[i] * right[i]; a += left[i] ** 2; b += right[i] ** 2; } return a && b ? dot / Math.sqrt(a * b) : 0; }
function tokenCount(value: string): number { return value.trim() ? value.trim().split(/\s+/).length : 0; }
