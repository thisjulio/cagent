import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import register from "../src/index";
import { captureCandidates } from "../src/capture";
import { memoryTools } from "../src/commands";
import { openStore } from "../src/sqlite-storage";
import { parseLearningDecision } from "../src/learning-decision";

function tempFile(): string { return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "memory-local-")), "memory.sqlite"); }

describe("local memory plugin", () => {
  test("captures pending candidates and masks secrets", () => {
    const entries = captureCandidates("We always run bun test. We decided API_KEY=secret-value", "test", "/project", []);
    expect(entries.length).toBe(2);
    expect(entries[0].status).toBe("approved");
    expect(entries[1].content).toContain("[redacted]");
    expect(captureCandidates("We prefer email: user@example.com", "test", "/project", []) [0].content).toContain("[redacted]");
  });

  test("learns an approved memory through an explicit tool call", async () => {
    const store = openStore(tempFile());
    const runtime = async () => { throw new Error("missing local model"); };
    const tools = Object.fromEntries(memoryTools(store, { retrieval: false, capture: true }, runtime as never).map((tool) => [tool.name, tool]));
    const result = await tools.memory_learn.execute({ content: "Architecture changes require an ADR.", scope: "project", kind: "convention" });
    expect(result.output).toContain("Added memory");
    expect(store.entries()[0]).toMatchObject({ status: "approved", source: "memory_learn" });
    store.close();
  });

  test("requires an explicit memory marker for response-based decisions", () => {
    expect(parseLearningDecision("We decided that architecture changes require an ADR.", [])).toBeUndefined();
  });

  test("persists approved memory when embeddings are unavailable", async () => {
    const store = openStore(tempFile());
    const runtime = async () => { throw new Error("missing local model"); };
    const tools = Object.fromEntries(memoryTools(store, { retrieval: false, capture: true }, runtime as never).map((tool) => [tool.name, tool]));
    const result = await tools.memory_add.execute({ content: "The user prefers comparative reflection.", scope: "user", kind: "preference" });
    expect(result.output).toContain("Added memory");
    expect(store.entries()[0]).toMatchObject({ status: "approved", embedding: undefined });
    store.close();
  });

  test("supports add, search, archive and forget", async () => {
    const file = tempFile(); const store = openStore(file); const tools = Object.fromEntries(memoryTools(store, { retrieval: false, capture: true }).map((tool) => [tool.name, tool]));
    const added = await tools.memory_add.execute({ content: "Use bun test for validation", kind: "convention", scope: "project" });
    const id = added.output.split(" ").at(-1)!;
    expect((await tools.memory_search.execute({ query: "bun test" })).output).toContain("Use bun test");
    await tools.memory_archive.execute({ id });
    expect((await tools.memory_search.execute({ query: "bun test" })).output).toContain("No memories");
    expect((await tools.memory_forget.execute({ id })).output).toContain("CONFIRMATION_REQUIRED");
    await tools.memory_forget.execute({ id, confirm: true });
    expect((await tools.memory_show.execute({ id })).output).toContain("No memories");
    store.close();
  });

  test("requires confirmation for restore and supports backup", async () => {
    const file = tempFile(); const backup = `${file}.backup`;
    const store = openStore(file);
    const tools = Object.fromEntries(memoryTools(store, { retrieval: false, capture: true }).map((tool) => [tool.name, tool]));
    await tools.memory_add.execute({ content: "Always use Bun", scope: "project", kind: "convention" });
    expect((await tools.memory_backup.execute({ destination: backup })).output).toContain("Backup created");
    expect((await tools.memory_restore.execute({ source: backup })).output).toContain("CONFIRMATION_REQUIRED");
    expect((await tools.memory_restore.execute({ source: backup, confirm: true })).output).toBe("Memory restored");
    store.close();
  });

  test("registers tools and observes lifecycle events", async () => {
    const file = tempFile(); const tools: string[] = []; const handlers = new Map<string, (payload: unknown) => unknown>();
    await register({ name: "memory-local", config: { path: file, retrieval: true }, observability: {} as never, registerTool: (tool) => tools.push(tool.name), registerHook: () => {}, registerProvider: () => {}, registerSubagent: () => {}, emit: () => {}, on: (event, handler) => handlers.set(event, handler), promptSection: () => {}, registerCommandSource: () => {}, registerContextExtension: () => {}, registerCommand: () => {}, contributeContext: async () => [], activity: () => {}, storage: { namespace: "memory-local", path: (...parts: string[]) => parts.join("/") }, diagnostics: { report: () => {} } });
    expect(tools).toContain("memory_add");
    handlers.get("turn.completed")?.({ content: "We always use bun test." });
    handlers.get("tool.completed")?.({ data: { content: "Always run bun test before release." } });
    const learned = openStore(file).entries(); expect(learned[0].status).toBe("approved");
  });
});
