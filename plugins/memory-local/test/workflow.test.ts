import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import register from "../src/index";

test("plugin workflow registers tools and captures through lifecycle events", async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "memory-e2e-")), "memory.json");
  const handlers = new Map<string, (payload: unknown) => unknown>(); const names: string[] = [];
  await register({ name: "memory-local", config: { path: file, retrieval: true }, observability: {} as never, registerTool: (tool) => names.push(tool.name), registerHook: () => {}, registerProvider: () => {}, registerSubagent: () => {}, emit: () => {}, on: (event, handler) => handlers.set(event, handler), promptSection: () => {}, registerCommandSource: () => {}, registerContextExtension: () => {}, registerCommand: () => {}, contributeContext: async () => [], activity: () => {}, storage: { namespace: "memory-local", path: (...parts: string[]) => parts.join("/") }, diagnostics: { report: () => {} } });
  expect(names).toContain("memory_add");
  handlers.get("turn.completed")?.({ version: 1, data: { content: "We always run Bun tests." } });
  expect(JSON.parse(fs.readFileSync(file, "utf8"))[0].status).toBe("pending");
});
