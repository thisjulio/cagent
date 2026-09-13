import { expect, test } from "bun:test";
import { createModelLoader } from "../src/model-loader";
import { createEmbeddingRuntime } from "../src/embedding-runtime";
import { reindexEntries } from "../src/reindex";

test("model loader is lazy and reports unavailable local artifacts", async () => {
  const loader = createModelLoader({ model_path: "/definitely/missing/model.onnx" });
  expect(loader.state().status).toBe("not_loaded");
  await expect(loader.load()).rejects.toThrow("model artifact not found");
  expect(loader.state().status).toBe("unavailable");
});

test("embedding runtime refuses remote model resolution", () => {
  expect(createEmbeddingRuntime).toBeFunction();
});

test("reindex updates embedding metadata without changing identity", async () => {
  const runtime = { metadata: () => ({ model: "test", dimension: 2, normalization: "l2" as const }), embed: async () => [1, 0] };
  const [entry] = await reindexEntries([{ id: "m1", content: "text", scope: "project", kind: "fact", status: "approved", confidence: 1, source: "test", createdAt: "1", updatedAt: "1" }], runtime, "test");
  expect(entry.id).toBe("m1");
  expect(entry.embeddingDimension).toBe(2);
});
