import fs from "node:fs";
import path from "node:path";
import type { EmbeddingMetadata, EmbeddingRuntime } from "./embedding-runtime";
import { createEmbeddingRuntime, MODEL_ID } from "./embedding-runtime";

export type ModelState = { status: "not_loaded" | "ready" | "unavailable"; metadata: EmbeddingMetadata; error?: string };

export function createModelLoader(config: Record<string, unknown>): { load(): Promise<EmbeddingRuntime>; state(): ModelState } {
  const modelPath = typeof config.model_path === "string" ? path.resolve(config.model_path) : undefined;
  let runtime: EmbeddingRuntime | undefined;
  let error: string | undefined;
  const metadata: EmbeddingMetadata = { model: MODEL_ID, dimension: 384, normalization: "l2" };
  return {
    async load() {
      if (runtime) return runtime;
      if (error) throw new Error(error);
      if (modelPath && !fs.existsSync(modelPath)) { error = `model artifact not found: ${modelPath}`; throw new Error(error); }
      try { runtime = await createEmbeddingRuntime(modelPath); return runtime; } catch (cause) { error = cause instanceof Error ? cause.message : String(cause); throw cause; }
    },
    state: () => ({ status: runtime ? "ready" : error ? "unavailable" : "not_loaded", metadata, ...(error ? { error } : {}) }),
  };
}
