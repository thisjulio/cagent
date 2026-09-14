export { projectIdentity } from "./project-identity";

export type MemoryScope = "project" | "user";
export type MemoryKind = "convention" | "decision" | "preference" | "fact";
export type MemoryStatus = "pending" | "approved" | "ignored" | "archived";
type MemoryEvidence = { path: string; symbol?: string; line?: number; commit?: string; kind: "code" | "test" | "adr" | "docs" };
export type MemoryEntry = {
  id: string; content: string; scope: MemoryScope; kind: MemoryKind; status: MemoryStatus;
  confidence: number; source: string; project?: string; conflict?: boolean; supersedes?: string;
  normalizedText?: string; embeddingModel?: string; embeddingDimension?: number; embedding?: number[];
  evidence?: MemoryEvidence[]; invalidatedAt?: string;
  createdAt: string; updatedAt: string;
};

export function scoped(entry: MemoryEntry, scope: MemoryScope | undefined, project: string): boolean {
  return (!scope || entry.scope === scope) && (entry.scope === "user" || entry.project === project);
}
