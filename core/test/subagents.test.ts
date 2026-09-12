import { test, expect } from "bun:test";
import type { LlmCallOptions, LlmChunk } from "@cagent/sdk";
import { EventBus } from "../src/events";
import { Registry } from "../src/registry";
import { createSubagentExecutor } from "../src/subagents/executor";
import { createSubagentTool } from "../src/subagents/tool";

function adapter(text: string) {
  return {
    list_models: async () => ["model"],
    prepare_call: async (options: LlmCallOptions) => options,
    async *stream(_request: LlmCallOptions): AsyncGenerator<LlmChunk> {
      yield { type: "text", text };
      yield { type: "finish", finish_reason: "stop" };
    },
  };
}

test("subagent executes with isolated instructions and selected provider", async () => {
  const registry = new Registry();
  const provider = adapter("delegated result");
  registry.registerProvider("mock", provider);
  registry.registerSubagent({ name: "reviewer", description: "Reviews", instructions: "Review strictly.", model: "mock/model" });
  const execute = createSubagentExecutor({ find: (name) => registry.subagent(name), registry, model: "mock/model", tools: [], allowlist: [], ask: async () => true, bus: new EventBus() });
  await expect(execute("reviewer", "Inspect this")).resolves.toBe("delegated result");
});

test("subagent tool rejects unknown agents and empty tasks", async () => {
  const tool = createSubagentTool(() => ["reviewer"], async () => "ok");
  expect((await tool.execute({ name: "missing", task: "x" })).isError).toBe(true);
  expect((await tool.execute({ name: "reviewer", task: " " })).isError).toBe(true);
});
