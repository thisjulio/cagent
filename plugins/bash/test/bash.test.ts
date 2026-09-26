import { expect, test } from "bun:test";
import type { PluginContext, ToolDefinition } from "@cagent/sdk";
import register from "../src/index";

function setup(): { tool: ToolDefinition; events: string[] } {
  const events: string[] = [];
  let tool: ToolDefinition | undefined;
  const context = {
    config: {},
    registerTool: (candidate: ToolDefinition) => {
      tool = candidate;
    },
    emit: (event: string) => {
      events.push(event);
    },
    promptSection: () => {},
  } as unknown as PluginContext;
  register(context);
  if (!tool) throw new Error("bash tool was not registered");
  return { tool, events };
}

test("bash runs a command and streams stdout", async () => {
  const { tool, events } = setup();
  const result = (await tool.execute({ command: "echo hi" })) as {
    output: string;
    isError?: boolean;
  };

  expect(result.output).toBe("hi\n");
  expect(result.summary).toBe("exit 0");
  expect(result.isError).toBe(false);
  expect(events).toContain("tools/stdout");
});

test("bash respects the timeout", async () => {
  const { tool } = setup();
  const started = Date.now();
  const result = (await tool.execute({
    command: "sleep 5",
    timeout_ms: 300,
  })) as { output: string; isError?: boolean; timedOut?: boolean };

  expect(result.timedOut).toBe(true);
  expect(result.isError).toBe(true);
  expect(result.summary).toBe("timed out");
  expect(Date.now() - started).toBeLessThan(3000);
});

test("bash limits accumulated output", async () => {
  const { tool } = setup();
  const result = await tool.execute({ command: "yes x | head -c 200000" });
  expect(result.output).toContain("output truncated");
  expect(result.output.length).toBeLessThan(132000);
});
