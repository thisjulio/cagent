import type { MemoryEntry, MemoryKind } from "./storage";

const SECRET = /(api[_ -]?key|token|password|secret|bearer|private[_ -]?key|credential)\s*[:=]\s*\S+/i;
const PERSONAL = /\b(?:cpf|ssn|email|e-mail|telefone|phone)\s*[:=]\s*\S+/i;
const DECLARATION = /^(?:remember|please remember|note that|we decided|our decision is|we always|we never|we prefer|i prefer|i always|i never|our convention is|our rule is|lembre que|anote que|decidimos que|nossa decisão é|sempre usamos|nunca usamos|preferimos|eu prefiro|eu sempre|eu nunca)\b/i;
const INTERNAL = /^(?:[{"'`\[]|[\]},"']|(?:const|let|import|export|function|return|status|operation|titles?|path|content|source|id|memory|agent|tool)\b)|(?:\b(?:read_file|write_file|apply_patch|graphify|task[s]?\.|functions\.)\b)/i;

export function captureCandidates(text: string, source: string, project: string, existing: MemoryEntry[], limit = 2): MemoryEntry[] {
  return text.split(/[\n.!?]+/).map((part) => part.trim()).filter((part) => part.length >= 12 && part.length <= 500)
    .filter((part) => DECLARATION.test(part) && !INTERNAL.test(part)).filter((part) => !existing.some((entry) => normalize(entry.content) === normalize(part)))
    .slice(0, limit).map((content) => { const suspicious = SECRET.test(content) || PERSONAL.test(content); const now = new Date().toISOString(); return {
      id: crypto.randomUUID(), content: suspicious ? mask(content) : content, scope: "project", kind: kindOf(content), status: "approved", confidence: suspicious ? 0.1 : 0.7,
      source, project, createdAt: now, updatedAt: now,
    }; });
}
function normalize(value: string): string { return value.toLocaleLowerCase().replace(/\s+/g, " ").trim(); }
function mask(value: string): string { return value.replace(/([:=]\s*)\S+/g, "$1[redacted]"); }
function kindOf(value: string): MemoryKind { return /decid|decision/i.test(value) ? "decision" : /prefer/i.test(value) ? "preference" : /use|run/i.test(value) ? "convention" : "fact"; }
