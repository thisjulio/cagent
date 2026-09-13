import type { EmbeddingRuntime } from "./embedding-runtime";
import type { MemoryEntry } from "./storage";

export async function reindexEntries(entries: MemoryEntry[], runtime: EmbeddingRuntime, model: string): Promise<MemoryEntry[]> {
  const metadata = runtime.metadata();
  const updated: MemoryEntry[] = [];
  for (const entry of entries) {
    const embedding = await runtime.embed(entry.content);
    updated.push({ ...entry, embedding, embeddingModel: model, embeddingDimension: metadata.dimension, updatedAt: new Date().toISOString() });
  }
  return updated;
}
