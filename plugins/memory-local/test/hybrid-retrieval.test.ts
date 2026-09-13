import { expect, test } from "bun:test";
import { hybridRetrieve } from "../src/hybrid-retrieval";

test("hybrid retrieval fuses lexical and vector ranks with filters and limits", () => {
  const results = hybridRetrieve([
    { id: "lex", content: "bun test command", scope: "project", kind: "fact", status: "approved", confidence: 1, source: "test", project: "/p", createdAt: "1", updatedAt: "1" },
    { id: "vec", content: "validation workflow", scope: "user", kind: "fact", status: "approved", confidence: 1, source: "test", embeddingModel: "m", embedding: [1, 0], createdAt: "2", updatedAt: "2" },
    { id: "hidden", content: "bun test", scope: "project", kind: "fact", status: "archived", confidence: 1, source: "test", project: "/p", createdAt: "3", updatedAt: "3" },
  ], "bun test", "/p", { queryVector: [1, 0], model: "m", limit: 2, maxTokens: 10 });
  expect(results.map((result) => result.entry.id)).toEqual(["lex", "vec"]);
  expect(results.every((result) => result.entry.status === "approved")).toBe(true);
});
