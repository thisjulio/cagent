import { defineTool, type ToolDefinition } from "@cagent/sdk";
import fs from "node:fs";
import path from "node:path";
import { projectIdentity, scoped, type MemoryEntry, type MemoryKind, type MemoryScope, type MemoryStatus } from "./storage";
import type { SqliteStore } from "./sqlite-storage";
import type { EmbeddingRuntime } from "./embedding-runtime";
import { hybridRetrieve } from "./hybrid-retrieval";

export function memoryTools(store: SqliteStore, state: { retrieval: boolean; capture: boolean }, getRuntime: () => Promise<EmbeddingRuntime> = async () => ({ metadata: () => ({ model: "none", dimension: 0, normalization: "l2" as const }), embed: async () => [] })): ToolDefinition[] {
  return [
    tool("memory_add", "Add an approved local memory.", { content: "string", scope: "string", kind: "string" }, async (args) => mutate(store, args, "approved", getRuntime)),
    tool("memory_learn", "Store durable knowledge automatically as an approved local memory.", { content: "string", scope: "string", kind: "string" }, async (args) => mutate(store, { ...args, source: "memory_learn" }, "approved", getRuntime)),
    tool("memory_list", "List local memories by scope and status.", { scope: "string", status: "string" }, async (args) => output(store.entries().filter((entry) => scoped(entry, optionalScope(args.scope), projectIdentity()) && (!args.status || entry.status === args.status)))),
    tool("memory_search", "Search local memories.", { query: "string", scope: "string" }, async (args) => search(store, String(args.query ?? ""), getRuntime)),
    tool("memory_show", "Show one local memory.", { id: "string" }, async (args) => output(store.entries().filter((entry) => entry.id === String(args.id)))),
    tool("memory_approve", "Approve a pending memory.", { id: "string" }, async (args) => update(store, String(args.id), { status: "approved" })),
    tool("memory_ignore", "Ignore a pending memory.", { id: "string" }, async (args) => update(store, String(args.id), { status: "ignored" })),
    tool("memory_archive", "Archive a memory without deleting it.", { id: "string" }, async (args) => update(store, String(args.id), { status: "archived" })),
    tool("memory_edit", "Edit a memory; edited entries remain pending.", { id: "string", content: "string" }, async (args) => update(store, String(args.id), { content: String(args.content ?? ""), status: "pending", embedding: undefined })),
    tool("memory_forget", "Permanently delete a memory after explicit confirmation.", { id: "string", confirm: "boolean" }, async (args) => {
      if (args.confirm !== true) return { output: "ERROR CONFIRMATION_REQUIRED — pass confirm=true to permanently forget a memory" };
      const entries = store.entries(); const next = entries.filter((entry) => entry.id !== String(args.id)); if (next.length !== entries.length) store.remove(String(args.id));
      return { output: next.length === entries.length ? "Memory not found" : "Memory forgotten" };
    }),
    tool("memory_pending", "List pending memory suggestions.", {}, async () => output(store.entries().filter((entry) => entry.status === "pending"))),
    tool("memory_review", "Review pending suggestions with explicit approve, edit, or ignore action.", { id: "string", action: "string", content: "string" }, async (args) => {
      const action = String(args.action ?? "");
      if (action === "approve") return update(store, String(args.id), { status: "approved" });
      if (action === "ignore") return update(store, String(args.id), { status: "ignored" });
      if (action === "edit") return update(store, String(args.id), { content: String(args.content ?? ""), status: "pending", embedding: undefined });
      return { output: "ERROR INVALID_REVIEW — action must be approve, edit, or ignore" };
    }),
    tool("memory_status", "Show local memory status.", {}, async () => ({ output: `Memory plugin: enabled\nCapture: ${state.capture ? "enabled" : "disabled"}\nRetrieval: ${state.retrieval ? "enabled" : "disabled"}\nEntries: ${store.entries().length}\nNetwork: disabled` })),
    tool("memory_diagnostics", "Show safe local memory diagnostics.", {}, async () => ({ output: `Storage: SQLite\nCapture: ${state.capture ? "enabled" : "disabled"}\nRetrieval: ${state.retrieval ? "enabled" : "disabled"}\nEmbedding: ONNX local runtime\nNetwork: disabled` })),
    tool("memory_conflicts", "List memories marked as conflicting.", {}, async () => output(store.entries().filter((entry) => entry.conflict === true))),
    tool("memory_backup", "Create a copy of the local memory file.", { destination: "string" }, async (args) => {
      const destination = path.resolve(String(args.destination ?? "memory.sqlite.backup"));
      fs.copyFileSync(store.db.name, destination);
      return { output: `Backup created: ${destination}` };
    }),
    tool("memory_restore", "Restore the local memory file from a backup.", { source: "string", confirm: "boolean" }, async (args) => {
      if (args.confirm !== true) return { output: "ERROR CONFIRMATION_REQUIRED — pass confirm=true to restore" };
      fs.copyFileSync(path.resolve(String(args.source)), store.db.name);
      return { output: "Memory restored" };
    }),
    tool("memory_retrieval", "Enable or disable retrieval for this session.", { enabled: "boolean" }, async (args) => { state.retrieval = args.enabled === true; return { output: `Retrieval ${state.retrieval ? "enabled" : "disabled"}` }; }),
    tool("memory_capture", "Enable or disable automatic capture for this session.", { enabled: "boolean" }, async (args) => { state.capture = args.enabled === true; return { output: `Capture ${state.capture ? "enabled" : "disabled"}` }; }),
  ];
}

function tool(name: string, description: string, properties: Record<string, string>, execute: (args: Record<string, unknown>) => Promise<{ output: string; isError?: boolean }>): ToolDefinition { return defineTool(name, description, { type: "object", properties: Object.fromEntries(Object.entries(properties).map(([key, type]) => [key, { type }])), required: [] }, execute); }
async function search(store: SqliteStore, query: string, getRuntime: () => Promise<EmbeddingRuntime>): Promise<{ output: string }> {
  try {
    const runtime = await getRuntime();
    return output(hybridRetrieve(store.entries(), query, projectIdentity(), { queryVector: await runtime.embed(query), model: runtime.metadata().model, limit: 5 }).map((hit) => hit.entry));
  } catch {
    const terms = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return output(store.entries().filter((entry) => entry.status === "approved" && terms.some((term) => entry.content.toLocaleLowerCase().includes(term))).slice(0, 5));
  }
}
async function mutate(store: SqliteStore, args: Record<string, unknown>, status: MemoryStatus, getRuntime: () => Promise<EmbeddingRuntime>): Promise<{ output: string }> {
  const content = String(args.content ?? "").trim();
  if (!content || content.length > 4000) return { output: "ERROR INVALID_MEMORY — content is required and must be short" };
  const now = new Date().toISOString();
  const entry: MemoryEntry = { id: crypto.randomUUID(), content, scope: args.scope === "user" ? "user" : "project", kind: validKind(args.kind), status, confidence: 1, source: typeof args.source === "string" ? args.source : "memory_add", project: projectIdentity(), createdAt: now, updatedAt: now };
  try {
    const runtime = await getRuntime();
    const metadata = runtime.metadata();
    entry.embedding = await runtime.embed(content);
    entry.embeddingModel = metadata.model;
    entry.embeddingDimension = metadata.dimension;
  } catch {
    // Manual memories remain usable through FTS5 when the local model is unavailable.
  }
  store.replace(entry);
  return { output: `Added memory ${entry.id}` };
}
async function update(store: SqliteStore, id: string, patch: Partial<MemoryEntry>): Promise<{ output: string }> { const entries = store.entries(); const entry = entries.find((item) => item.id === id); if (!entry) return { output: "Memory not found" }; store.replace({ ...entry, ...patch, updatedAt: new Date().toISOString() }); return { output: "Memory updated" }; }
function output(entries: MemoryEntry[]): { output: string } { return { output: entries.length ? entries.map((entry) => `[${entry.id}] (${entry.status}/${entry.kind}/${entry.scope}) ${entry.content}`).join("\n") : "No memories found." }; }
function optionalScope(value: unknown): MemoryScope | undefined { return value === "project" || value === "user" ? value : undefined; }
function validKind(value: unknown): MemoryKind { return ["convention", "decision", "preference", "fact"].includes(String(value)) ? String(value) as MemoryKind : "fact"; }
