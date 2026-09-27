import React, { act } from "react";
import { testRender } from "@opentui/react/test-utils";
import type { ProviderAdapter } from "@cagent/sdk";
import type { ChatItem } from "../src/controller/state.js";
import { App } from "../src/ui/components/App.js";
import { Controller } from "../src/controller/controller.js";
import { EventBus } from "../src/events.js";
import { Registry } from "../src/registry.js";
import { loadConfig } from "../src/config.js";
import { ensureToolTitle } from "../src/tool-title.js";

type SnapTool = "write" | "read" | "bash";
const TOOL_ALIASES: Record<string, SnapTool> = {
  write: "write",
  write_file: "write",
  read: "read",
  read_file: "read",
  bash: "bash",
};
const TURN_ID = "snapshot-turn";
const LARGE_TURN_ID = "large-edit-turn";
const FAILURE_TURN_ID = "failure-turn";
const TIMESTAMP = 1_700_000_000_000;

function selectedTools(): Set<SnapTool> | null {
  const argument = process.argv.find((value) => value.startsWith("--tool="));
  if (!argument) return null;
  const selected = new Set<SnapTool>();
  for (const value of argument.slice("--tool=".length).split(",")) {
    const tool = TOOL_ALIASES[value.trim().toLowerCase()];
    if (!tool) throw new Error(`Unknown snapshot tool "${value}".`);
    selected.add(tool);
  }
  return selected;
}

function withTurn(item: ChatItem, turnId = TURN_ID): ChatItem {
  return { ...item, turnId, timestamp: TIMESTAMP };
}

function multilineToolScenarios(): ChatItem[] {
  return [
    withTurn({
      kind: "user",
      content: "the order total ignores quantity; fix it and run the tests",
    }),
    withTurn({
      kind: "thinking",
      content:
        "The user wants total() to multiply price by qty. I will read the file, edit it, and run bun test.",
      expanded: true,
    }),
    withTurn({
      kind: "tool",
      toolName: "skill",
      toolCategory: "skill",
      title: ensureToolTitle("skill", "skill", "generic", {
        name: "ponytail",
      }),
      cmd: "ponytail",
      content:
        '<skill_content name="ponytail">Skill instructions.</skill_content>',
      expanded: false,
      running: false,
    }),
    withTurn({
      kind: "tool",
      toolName: "read_file",
      toolCategory: "read",
      title: "Read total.ts",
      cmd: "src/orders/total.ts",
      content:
        "1\texport function total(items){\n2\t  return items.reduce((s,i)=>s+i.price,0);\n3\t}",
      running: false,
      display: {
        kind: "code",
        content:
          "export function total(items){\n  return items.reduce((s,i)=>s+i.price,0);\n}",
        filetype: "typescript",
        lineNumbers: true,
      },
    }),
    withTurn({
      kind: "tool",
      toolName: "search",
      toolCategory: "search",
      title: "Find callers of total",
      cmd: "total\\(",
      summary: "3 matches",
      content:
        "src/orders/checkout.ts:14: …\nsrc/orders/invoice.ts:31: …\ntest/total.test.ts:3: …",
      running: false,
    }),
    withTurn({
      kind: "tool",
      toolName: "subagent",
      toolCategory: "agent",
      title: ensureToolTitle(undefined, "subagent", "agent", {
        name: "general",
      }),
      cmd: "general",
      detail: "Trace how read and search tool rows are rendered",
      summary: "completed",
      durationMs: 8400,
      content:
        "Read and search use separate fields to represent their targets.",
      running: false,
    }),
    withTurn({
      kind: "tool",
      toolName: "edit_file",
      toolCategory: "write",
      title: "Multiply price by quantity",
      cmd: "src/orders/total.ts",
      content:
        "edited\nLSP · TypeScript · complete · 1 finding · src/orders/total.ts\n  src/orders/total.ts:2:28 Parameter 'qty' implicitly has an 'any' type.",
      running: false,
      changesWorkspace: true,
      changedPaths: ["src/orders/total.ts"],
      display: {
        kind: "diff",
        filetype: "typescript",
        path: "src/orders/total.ts",
        content:
          "--- a/src/orders/total.ts\n+++ b/src/orders/total.ts\n@@ -1,3 +1,3 @@\n export function total(items){\n-  return items.reduce((s,i)=>s+i.price,0);\n+  return items.reduce((s,i)=>s+i.price*(i.qty ?? 1),0);\n }",
      },
    }),
    withTurn({
      kind: "tool",
      toolName: "bash",
      toolCategory: "shell",
      title: "Run tests",
      cmd: "bun test test/total.test.ts",
      summary: "exit 0",
      durationMs: 1400,
      content: "…9 lines of bun test output…",
      running: false,
      display: {
        kind: "terminal",
        stdout:
          "bun test\n✓ total > multiplies quantity\n1 pass\n0 fail\nFinished in 18ms\ncoverage 100%\n✓ all tests passed\n",
        exitCode: 0,
      },
    }),
    withTurn({
      kind: "assistant",
      content:
        "Updated total() to multiply price by qty (default 1).\n\nThe callers in checkout.ts and invoice.ts already pass qty.",
    }),
  ];
}

function largeDiffScenario(): ChatItem {
  const additions = Array.from(
    { length: 20 },
    (_, index) => `+  const value${index + 1} = ${index + 1};`,
  ).join("\n");
  return withTurn(
    {
      kind: "tool",
      toolName: "edit_file",
      toolCategory: "write",
      title: "Edit attribution.ts",
      cmd: "plugins/anthropic/src/attribution.ts",
      content: "edited",
      running: false,
      changesWorkspace: true,
      changedPaths: ["plugins/anthropic/src/attribution.ts"],
      display: {
        kind: "diff",
        content: `--- a/plugins/anthropic/src/attribution.ts\n+++ b/plugins/anthropic/src/attribution.ts\n@@ -0,0 +1,20 @@\n${additions}`,
        filetype: "typescript",
        path: "plugins/anthropic/src/attribution.ts",
      },
    },
    LARGE_TURN_ID,
  );
}

function failingToolScenario(): ChatItem {
  return withTurn(
    {
      kind: "tool",
      toolName: "bash",
      toolCategory: "shell",
      title: "Run tests",
      cmd: "bun test",
      summary: "exit 1",
      running: false,
      isError: true,
      durationMs: 2000,
      content:
        "bun test\n✗ total > multiplies quantity\n  Expected: 6  Received: 3\n  at test/total.test.ts:12\n\n1 pass\n1 fail",
      display: {
        kind: "terminal",
        stdout:
          "bun test\n✗ total > multiplies quantity\n  Expected: 6  Received: 3\n  at test/total.test.ts:12\n\n1 pass\n1 fail",
        exitCode: 1,
      },
    },
    FAILURE_TURN_ID,
  );
}

const adapter = {
  list_models: async () => ["stub-model"],
  prepare_call: async (options: unknown) => options,
  stream: async function* () {},
} as unknown as ProviderAdapter;
const controller = new Controller({
  config: loadConfig(process.cwd()),
  registry: new Registry(),
  bus: new EventBus(),
  adapter,
  model: "stub/stub-model",
  systemPrompt: "snapshot",
});
controller.state.chat = [];
controller.state.toolLog = [];
controller.state.tokens = 0;

async function frame(width: number, height = 40): Promise<void> {
  const setup = await testRender(<App c={controller} />, { width, height });
  await act(async () => setup.flush());
  const lines = setup.captureCharFrame().split("\n");
  console.log(`\n=== ${width} cols ===`);
  console.log(`┌${"─".repeat(width)}┐`);
  console.log(
    lines.map((line) => `│${line.slice(0, width).padEnd(width)}`).join("\n"),
  );
  console.log(`└${"─".repeat(width)}┘`);
  act(() => setup.renderer.destroy());
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log("Usage: bun core/scripts/snap.tsx [--tool=write,read,bash]");
  process.exit(0);
}

const tools = selectedTools();
const scenarios = multilineToolScenarios();
if (tools) {
  controller.state.chat = scenarios.filter(
    (item) =>
      item.kind !== "tool" ||
      (item.toolName === "edit_file" && tools.has("write")) ||
      (item.toolName === "read_file" && tools.has("read")) ||
      (item.toolName === "bash" && tools.has("bash")),
  );
  controller.state.title = `turn hierarchy: ${[...tools].join(", ")}`;
  await frame(80);
  process.exit(0);
}

controller.state.chat = scenarios;
controller.state.title = "turn hierarchy";
for (const width of [60, 80, 120]) await frame(width);

controller.state.chat = [
  withTurn({ kind: "user", content: "add a helper" }, LARGE_TURN_ID),
  largeDiffScenario(),
  withTurn(
    { kind: "assistant", content: "Added a 20-line helper." },
    LARGE_TURN_ID,
  ),
];
controller.state.title = "large edit";
await frame(80);

controller.state.chat = [
  withTurn({ kind: "user", content: "run tests" }, FAILURE_TURN_ID),
  failingToolScenario(),
  withTurn({ kind: "assistant", content: "One test failed." }, FAILURE_TURN_ID),
];
controller.state.title = "tool failure";
await frame(80);

const SUBAGENT_TURN_ID = "subagent-turn";
controller.state.tasks = [];
controller.state.chat = [
  withTurn(
    { kind: "user", content: "@general inspect the tool timeline" },
    SUBAGENT_TURN_ID,
  ),
  withTurn(
    {
      kind: "assistant",
      content: "",
      subagent: "general",
      subagentHeader: true,
      running: true,
    },
    SUBAGENT_TURN_ID,
  ),
];
controller.state.busy = true;
controller.state.title = "subagent running";
await frame(80);

controller.state.chat = [
  withTurn(
    {
      kind: "assistant",
      content: "",
      subagent: "general",
      subagentHeader: true,
      durationMs: 8400,
    },
    SUBAGENT_TURN_ID,
  ),
  withTurn(
    {
      kind: "assistant",
      content:
        "Read and search use separate fields to represent their targets.",
      subagent: "general",
    },
    SUBAGENT_TURN_ID,
  ),
];
controller.state.busy = false;
controller.state.title = "subagent complete";
await frame(80);

controller.state.chat = [];
controller.state.tasks = [
  { id: "task-1", title: "Inspect task layout", status: "completed" },
  { id: "task-2", title: "Add TaskPanel snapshots", status: "in_progress" },
  { id: "task-3", title: "Verify footer placement", status: "pending" },
];
controller.state.taskPanelExpanded = false;
controller.state.title = "tasks collapsed";
await frame(80);

controller.state.taskPanelExpanded = true;
controller.state.title = "tasks expanded";
await frame(80);
