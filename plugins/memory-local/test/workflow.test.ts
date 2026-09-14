import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import register from "../src/index";
import { openStore } from "../src/sqlite-storage";

test("plugin workflow registers tools and captures through lifecycle events", async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "memory-e2e-")), "memory.sqlite");
  const handlers = new Map<string, (payload: unknown) => unknown>(); const names: string[] = [];
  await register({ name: "memory-local", config: { path: file, retrieval: true }, observability: {} as never, registerTool: (tool) => names.push(tool.name), registerHook: () => {}, registerProvider: () => {}, registerSubagent: () => {}, emit: () => {}, on: (event, handler) => handlers.set(event, handler), promptSection: () => {}, registerCommandSource: () => {}, registerContextExtension: () => {}, registerCommand: () => {}, contributeContext: async () => [], activity: () => {}, storage: { namespace: "memory-local", path: (...parts: string[]) => parts.join("/") }, diagnostics: { report: () => {} } });
  expect(names).toContain("memory_add");
  handlers.get("turn.completed")?.({ version: 1, data: { content: "We always run bun test." } });
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(openStore(file).entries()[0].status).toBe("approved");
});

test("agent decides to learn and the memory is persisted", async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "memory-decision-")), "memory.sqlite");
  const tools = new Map<string, { execute: (args: Record<string, unknown>) => Promise<{ output: string }> }>();
  await register({
    name: "memory-local", config: { path: file, retrieval: false }, observability: {} as never,
    registerTool: (tool) => tools.set(tool.name, tool), registerHook: () => {}, registerProvider: () => {},
    registerSubagent: () => {}, emit: () => {}, on: () => {}, promptSection: () => {},
    registerCommandSource: () => {}, registerContextExtension: () => {}, registerCommand: () => {},
    contributeContext: async () => [], activity: () => {},
    storage: { namespace: "memory-local", path: (...parts: string[]) => parts.join("/") },
    diagnostics: { report: () => {} },
  });

  const decision = tools.get("memory_learn");
  expect(decision).toBeDefined();
  await decision!.execute({ content: "Architecture decisions require an ADR.", scope: "project", kind: "decision" });

  const store = openStore(file);
  expect(store.entries()).toEqual([expect.objectContaining({
    content: "Architecture decisions require an ADR.",
    status: "approved",
    source: "memory_learn",
    kind: "decision",
  })]);
  store.close();
});
