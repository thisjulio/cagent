import type { MemoryKind } from "./storage";
import type { Evidence } from "./architecture-learning";

export type LearningDecision = { shouldPersist: boolean; content: string; scope: "project" | "user"; kind: MemoryKind; confidence: number; status: "approved" | "pending" | "ignored"; evidence: Evidence[]; reason: string };

const SAVE = /(?:memory|remember|learn|convention|architecture|decisão|convenção|preferência|fato)\s*[:：]/i;
const SKIP = /(?:do not|don't|never|not a memory|temporary|hypothesis only|não salvar|não memorize)/i;
const KIND: Array<[RegExp, MemoryKind]> = [[/preference|preferência/i, "preference"], [/decision|decisão/i, "decision"], [/convention|convenção|architecture|arquitetura/i, "convention"], [/fact|fato/i, "fact"]];

export function parseLearningDecision(text: string, evidence: Evidence[]): LearningDecision | undefined {
  if (!SAVE.test(text)) return undefined;
  const content = text.split(/\n/).map((line) => line.replace(/^[-*]\s*/, "").trim())
    .find((line) => /^(?:memory|learning|aprendizado)\s*[:：]/i.test(line))
    ?.replace(/^(?:memory|learning|aprendizado)\s*[:：]\s*/i, "") ?? "";
  if (!content || SKIP.test(text)) return { shouldPersist: false, content, scope: "project", kind: "fact", confidence: 0, status: "ignored", evidence, reason: "The agent explicitly declined persistence." };
  const kind = KIND.find(([pattern]) => pattern.test(text))?.[1] ?? "fact";
  const confidence = Math.min(0.99, 0.75 + evidence.length * 0.05);
  return { shouldPersist: true, content, scope: /user|usuário|preference|preferência/i.test(text) ? "user" : "project", kind, confidence, status: confidence >= 0.8 ? "approved" : "pending", evidence, reason: "The agent explicitly identified durable knowledge." };
}
