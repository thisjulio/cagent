import fs from "node:fs";
import crypto from "node:crypto";
import { pipeline, env } from "@huggingface/transformers";

export const MODEL_ID = "intfloat/multilingual-e5-small";
const EMBEDDING_DIMENSION = 384;

env.allowRemoteModels = false;
env.allowLocalModels = true;

export type EmbeddingMetadata = { model: string; dimension: number; normalization: "l2"; artifactHash?: string };
export type EmbeddingRuntime = { embed(text: string): Promise<number[]>; metadata(): EmbeddingMetadata };

export async function createEmbeddingRuntime(modelPath?: string): Promise<EmbeddingRuntime> {
  let extractor: unknown;
  const metadata: EmbeddingMetadata = { model: MODEL_ID, dimension: EMBEDDING_DIMENSION, normalization: "l2", artifactHash: modelPath ? hashArtifact(modelPath) : undefined };
  return {
    embed: async (text) => {
      if (!extractor) extractor = await pipeline("feature-extraction", modelPath ?? MODEL_ID, { local_files_only: true, dtype: "int8" });
      const output = await (extractor as (input: string, options: Record<string, unknown>) => Promise<{ data: Float32Array; dims: number[] }>)(`query: ${text}`, { pooling: "mean", normalize: true });
      return Array.from(output.data);
    },
    metadata: () => metadata,
  };
}

function hashArtifact(file: string): string | undefined {
  try { return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"); } catch { return undefined; }
}
