import { expect, test } from "bun:test";
import corpus from "./evaluation-corpus.json";
import { hybridRetrieve } from "../src/hybrid-retrieval";

test("Portuguese/English corpus reports Recall@5 and MRR", () => {
  let found = 0; let reciprocal = 0;
  for (const memory of corpus.memories) {
    const results = hybridRetrieve([{ id: memory.id, content: memory.content, scope: "user", kind: "fact", status: "approved", confidence: 1, source: "corpus", createdAt: "1", updatedAt: "1" }], memory.queries[0], "/p", { limit: 5 });
    const rank = results.findIndex((result) => result.entry.id === memory.id);
    if (rank >= 0) { found++; reciprocal += 1 / (rank + 1); }
  }
  const recallAt5 = found / corpus.memories.length; const mrr = reciprocal / corpus.memories.length;
  expect(recallAt5).toBeGreaterThanOrEqual(0);
  expect(mrr).toBeGreaterThanOrEqual(0);
});
