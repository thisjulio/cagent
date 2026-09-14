import type { MemoryEntry, MemoryKind } from "./storage";

export type Evidence = { path: string; symbol?: string; line?: number; commit?: string; kind: "code" | "test" | "adr" | "docs" };
export type ArchitectureCandidate = { content: string; kind: MemoryKind; confidence: number; status: "pending" | "approved"; evidence: Evidence[] };

const DECLARATION = /(?:the|this|our) (?:flow|architecture|convention|rule|design)|always|must|routes through|belongs in|convention|architecture|fluxo|convenção|arquitetura|sempre|deve passar/i;
const PATH = /(?:^|\s)((?:[\w.-]+\/)+[\w.-]+\.(?:ts|tsx|js|md|json))(?:\s*[:#](\d+))?/g;
const KIND: Array<[RegExp, MemoryKind]> = [[/convention|convenção|always|sempre/i, "convention"], [/decided|decision|decidimos|decisão/i, "decision"], [/prefer|preferimos/i, "preference"]];

export function extractArchitectureCandidates(text: string, evidence: Evidence[], existing: MemoryEntry[]): ArchitectureCandidate[] {
  if (!DECLARATION.test(text) || evidence.length === 0) return [];
  const paths = [...text.matchAll(PATH)].map((match) => ({ path: match[1], line: match[2] ? Number(match[2]) : undefined }));
  const allEvidence = [...evidence, ...paths.map((item) => ({ ...item, kind: classifyEvidence(item.path) }))];
  const unique = dedupeEvidence(allEvidence);
  const content = text.trim().replace(/\s+/g, " ");
  if (existing.some((entry) => normalize(entry.content) === normalize(content))) return [];
  const kind = KIND.find(([pattern]) => pattern.test(content))?.[1] ?? "fact";
  const confidence = confidenceFor(unique);
  return [{ content, kind, confidence, status: confidence >= 0.85 ? "approved" : "pending", evidence: unique }];
}

function confidenceFor(evidence: Evidence[]): number {
  const kinds = new Set(evidence.map((item) => item.kind));
  if (kinds.has("code") && (kinds.has("test") || kinds.has("adr") || kinds.has("docs"))) return 0.95;
  if (kinds.size > 1) return 0.8;
  return 0.6;
}
function classifyEvidence(path: string): Evidence["kind"] { return /test\.|\.test\.|spec\./i.test(path) ? "test" : /adr|readme|docs/i.test(path) ? /adr/i.test(path) ? "adr" : "docs" : "code"; }
function dedupeEvidence(items: Evidence[]): Evidence[] { return [...new Map(items.map((item) => [`${item.kind}:${item.path}:${item.line ?? ""}`, item])).values()]; }
function normalize(value: string): string { return value.toLocaleLowerCase().replace(/\s+/g, " ").trim(); }
