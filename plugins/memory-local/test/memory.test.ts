import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import register from "../src/index";
import { captureCandidates } from "../src/capture";
import { memoryTools } from "../src/commands";

function tempFile(): string { return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "memory-local-")), "memory.json"); }

describe("local memory plugin", () => {
  test("captures pending candidates and masks secrets", () => {
    const entries = captureCandidates("We always run bun test. We decided API_KEY=secret-value", "test", "/project", []);
    expect(entries.length).toBe(2);
    expect(entries[0].status).toBe("pending");
    expect(entries[1].content).toContain("[redacted]");
    expect(captureCandidates("We prefer email: user@example.com", "test", "/project", []) [0].content).toContain("[redacted]");
  });

  test("supports add, search, archive and forget", async () => {
    const file = tempFile(); const tools = Object.fromEntries(memoryTools(file, { retrieval: false }).map((tool) => [tool.name, tool]));
    const added = await tools.memory_add.execute({ content: "Use bun test for validation", kind: "convention", scope: "project" });
    const id = added.output.split(" ").at(-1)!;
    expect((await tools.memory_search.execute({ query: "bun test" })).output).toContain("Use bun test");
    await tools.memory_archive.execute({ id });
    expect((await tools.memory_search.execute({ query: "bun test" })).output).toContain("No memories");
    expect((await tools.memory_forget.execute({ id })).output).toContain("CONFIRMATION_REQUIRED");
    await tools.memory_forget.execute({ id, confirm: true });
    expect((await tools.memory_show.execute({ id })).output).toContain("No memories");
  });

  test("registers tools and observes lifecycle events", async () => {
    const file = tempFile(); const tools: string[] = []; const handlers = new Map<string, (payload: unknown) => unknown>();
    await register({ name: "memory-local", config: { path: file, retrieval: true }, observability: {} as never, registerTool: (tool) => tools.push(tool.name), registerHook: () => {}, registerProvider: () => {}, registerSubagent: () => {}, emit: () => {}, on: (event, handler) => handlers.set(event, handler), promptSection: () => {}, registerCommandSource: () => {} });
    expect(tools).toContain("memory_add");
    handlers.get("turn.completed")?.({ content: "We always use bun test." });
    handlers.get("tool.completed")?.({ data: { content: "Always run bun test before release." } });
    const pending = JSON.parse(fs.readFileSync(file, "utf8")); expect(pending[0].status).toBe("pending");
    const reviewTools = Object.fromEntries((await import("../src/commands")).memoryTools(file, { retrieval: false }).map((tool) => [tool.name, tool]));
    await reviewTools.memory_review.execute({ id: pending[0].id, action: "approve" });
    expect(JSON.parse(fs.readFileSync(file, "utf8"))[0].status).toBe("approved");
  });
});
