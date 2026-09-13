import { defineTool, type ToolDefinition } from "@cagent/sdk";
import { loadEntries, projectIdentity, saveEntries, scoped, type MemoryEntry, type MemoryKind, type MemoryScope, type MemoryStatus } from "./storage";
import { rankEntries } from "./retrieval";

export function memoryTools(file: string, state: { retrieval: boolean; capture: boolean }): ToolDefinition[] {
  return [
    tool("memory_add", "Add an approved local memory.", { content: "string", scope: "string", kind: "string" }, async (args) => mutate(file, args, "approved")),
    tool("memory_list", "List local memories by scope and status.", { scope: "string", status: "string" }, async (args) => output(loadEntries(file).filter((entry) => scoped(entry, optionalScope(args.scope), projectIdentity()) && (!args.status || entry.status === args.status)))),
    tool("memory_search", "Search local memories.", { query: "string", scope: "string" }, async (args) => output(rankEntries(loadEntries(file), String(args.query ?? ""), projectIdentity(), { scope: optionalScope(args.scope), limit: 5 }).map((hit) => hit.entry))),
    tool("memory_show", "Show one local memory.", { id: "string" }, async (args) => output(loadEntries(file).filter((entry) => entry.id === String(args.id)))),
    tool("memory_approve", "Approve a pending memory.", { id: "string" }, async (args) => update(file, String(args.id), { status: "approved" })),
    tool("memory_ignore", "Ignore a pending memory.", { id: "string" }, async (args) => update(file, String(args.id), { status: "ignored" })),
    tool("memory_archive", "Archive a memory without deleting it.", { id: "string" }, async (args) => update(file, String(args.id), { status: "archived" })),
    tool("memory_edit", "Edit a memory; edited entries remain pending.", { id: "string", content: "string" }, async (args) => update(file, String(args.id), { content: String(args.content ?? ""), status: "pending" })),
    tool("memory_forget", "Permanently delete a memory after explicit confirmation.", { id: "string", confirm: "boolean" }, async (args) => {
      if (args.confirm !== true) return { output: "ERROR CONFIRMATION_REQUIRED — pass confirm=true to permanently forget a memory" };
      const entries = loadEntries(file); const next = entries.filter((entry) => entry.id !== String(args.id)); saveEntries(file, next);
      return { output: next.length === entries.length ? "Memory not found" : "Memory forgotten" };
    }),
    tool("memory_pending", "List pending memory suggestions.", {}, async () => output(loadEntries(file).filter((entry) => entry.status === "pending"))),
    tool("memory_review", "Review pending suggestions with explicit approve, edit, or ignore action.", { id: "string", action: "string", content: "string" }, async (args) => {
      const action = String(args.action ?? "");
      if (action === "approve") return update(file, String(args.id), { status: "approved" });
      if (action === "ignore") return update(file, String(args.id), { status: "ignored" });
      if (action === "edit") return update(file, String(args.id), { content: String(args.content ?? ""), status: "pending" });
      return { output: "ERROR INVALID_REVIEW — action must be approve, edit, or ignore" };
    }),
    tool("memory_status", "Show local memory status.", {}, async () => ({ output: `Memory plugin: enabled\nCapture: ${state.capture ? "enabled" : "disabled"}\nRetrieval: ${state.retrieval ? "enabled" : "disabled"}\nEntries: ${loadEntries(file).length}\nNetwork: disabled` })),
    tool("memory_diagnostics", "Show safe local memory diagnostics.", {}, async () => ({ output: `Storage: ${file}\nCapture: ${state.capture ? "enabled" : "disabled"}\nRetrieval: ${state.retrieval ? "enabled" : "disabled"}\nEmbedding: lexical fallback\nNetwork: disabled` })),
    tool("memory_conflicts", "List memories marked as conflicting.", {}, async () => output(loadEntries(file).filter((entry) => entry.conflict === true))),
    tool("memory_retrieval", "Enable or disable retrieval for this session.", { enabled: "boolean" }, async (args) => { state.retrieval = args.enabled === true; return { output: `Retrieval ${state.retrieval ? "enabled" : "disabled"}` }; }),
    tool("memory_capture", "Enable or disable automatic capture for this session.", { enabled: "boolean" }, async (args) => { state.capture = args.enabled === true; return { output: `Capture ${state.capture ? "enabled" : "disabled"}` }; }),
  ];
}

function tool(name: string, description: string, properties: Record<string, string>, execute: (args: Record<string, unknown>) => Promise<{ output: string; isError?: boolean }>): ToolDefinition { return defineTool(name, description, { type: "object", properties: Object.fromEntries(Object.entries(properties).map(([key, type]) => [key, { type }])), required: [] }, execute); }
async function mutate(file: string, args: Record<string, unknown>, status: MemoryStatus): Promise<{ output: string }> { const content = String(args.content ?? "").trim(); if (!content || content.length > 4000) return { output: "ERROR INVALID_MEMORY — content is required and must be short" }; const now = new Date().toISOString(); const entry: MemoryEntry = { id: crypto.randomUUID(), content, scope: args.scope === "user" ? "user" : "project", kind: validKind(args.kind), status, confidence: 1, source: "memory_add", project: projectIdentity(), createdAt: now, updatedAt: now }; const entries = loadEntries(file); saveEntries(file, [...entries, entry]); return { output: `Added memory ${entry.id}` }; }
async function update(file: string, id: string, patch: Partial<MemoryEntry>): Promise<{ output: string }> { const entries = loadEntries(file); const found = entries.some((entry) => entry.id === id); saveEntries(file, entries.map((entry) => entry.id === id ? { ...entry, ...patch, updatedAt: new Date().toISOString() } : entry)); return { output: found ? "Memory updated" : "Memory not found" }; }
function output(entries: MemoryEntry[]): { output: string } { return { output: entries.length ? entries.map((entry) => `[${entry.id}] (${entry.status}/${entry.kind}/${entry.scope}) ${entry.content}`).join("\n") : "No memories found." }; }
function optionalScope(value: unknown): MemoryScope | undefined { return value === "project" || value === "user" ? value : undefined; }
function validKind(value: unknown): MemoryKind { return ["convention", "decision", "preference", "fact"].includes(String(value)) ? String(value) as MemoryKind : "fact"; }
