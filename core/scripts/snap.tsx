import React, { act } from "react";
import { testRender } from "@opentui/react/test-utils";
import type { ProviderAdapter } from "@cagent/sdk";
import { App } from "../src/ui/components/App.js";
import { Controller } from "../src/controller/controller.js";
import { EventBus } from "../src/events.js";
import { Registry } from "../src/registry.js";
import { loadConfig } from "../src/config.js";

type SnapTool = "write" | "read" | "bash";
const TOOL_ALIASES: Record<string, SnapTool> = {
  write: "write",
  write_file: "write",
  read: "read",
  read_file: "read",
  bash: "bash",
};

function selectedTools(): Set<SnapTool> | null {
  const argument = process.argv.find((value) => value.startsWith("--tool="));
  if (!argument) return null;
  const values = argument.slice("--tool=".length).split(",");
  const selected = new Set<SnapTool>();
  for (const value of values) {
    const tool = TOOL_ALIASES[value.trim().toLowerCase()];
    if (!tool) {
      throw new Error(
        `Unknown snap tool "${value}". Use write, read, or bash.`,
      );
    }
    selected.add(tool);
  }
  return selected;
}

function printHelp(): void {
  console.log(
    [
      "Usage: bun core/scripts/snap.tsx [--tool=write,read,bash]",
      "",
      "Render all snapshot scenarios by default.",
      "With --tool, render only the selected multiline tool fixtures.",
      "Aliases: write/write_file, read/read_file, bash.",
    ].join("\n"),
  );
}

const tools = selectedTools();
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  printHelp();
  process.exit(0);
}

// Provider stub: the snapshot only renders and never calls the LLM.
const adapter = {
  list_models: async () => ["stub-model"],
  prepare_call: async (o: unknown) => o,
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
controller.state.chat = []; // Empty, deterministic state (the constructor creates a new session).
controller.state.toolLog = [];
controller.state.tokens = 0;

function multilineToolScenarios() {
  const scenarios = [
    {
      kind: "user" as const,
      content: "edit a temporary file, read it, and run a multiline echo",
    },
    {
      kind: "thinking" as const,
      content:
        "**Planning temporary file editing and pipeline execution**\n*Setting up temporary file writing task*",
    },
    {
      kind: "tool" as const,
      toolName: "tasks",
      toolCategory: "generic" as const,
      cmd: "tasks",
      content: "created 3 tasks",
      running: false,
    },
    {
      kind: "tool" as const,
      toolName: "write_file",
      toolCategory: "write" as const,
      cmd: "temporary-layout-check.txt",
      content: "written temporary-layout-check.txt",
      running: false,
      expanded: true,
      display: {
        kind: "diff" as const,
        content:
          "--- a/temporary-layout-check.txt\n+++ b/temporary-layout-check.txt\n@@ -0,0 +1,3 @@\n+first temporary line\n+second temporary line\n+third temporary line",
        filetype: "text",
      },
    },
    {
      kind: "tool" as const,
      toolName: "tasks",
      toolCategory: "generic" as const,
      cmd: "tasks",
      content: "completed write task",
      running: false,
    },
    {
      kind: "tool" as const,
      toolName: "read_file",
      toolCategory: "read" as const,
      cmd: "temporary-layout-check.txt",
      content:
        "1\tfirst temporary line\n2\tsecond temporary line\n3\tthird temporary line",
      running: false,
      expanded: true,
      display: {
        kind: "code" as const,
        content:
          "first temporary line\nsecond temporary line\nthird temporary line",
        filetype: "text",
        lineNumbers: true,
        lineStart: 1,
      },
    },
    {
      kind: "tool" as const,
      toolName: "tasks",
      toolCategory: "generic" as const,
      cmd: "tasks",
      content: "completed read task",
      running: false,
    },
    {
      kind: "tool" as const,
      toolName: "bash",
      toolCategory: "shell" as const,
      cmd: "echo 'first echo line'; echo 'second echo line'; echo 'third echo line'",
      content: "first echo line\nsecond echo line\nthird echo line",
      running: false,
      expanded: true,
      display: {
        kind: "terminal" as const,
        stdout: "first echo line\nsecond echo line\nthird echo line",
        exitCode: 0,
      },
    },
    {
      kind: "tool" as const,
      toolName: "tasks",
      toolCategory: "generic" as const,
      cmd: "tasks",
      content: "completed echo task",
      running: false,
    },
    {
      kind: "assistant" as const,
      content:
        "Concluído:\n\n- Criei o arquivo temporário.\n- Li o arquivo.\n- Executei o echo multilinhas.",
    },
  ];
  if (!tools) return scenarios;
  return scenarios.filter(
    (item) =>
      item.kind !== "tool" ||
      (item.toolName === "write_file" && tools.has("write")) ||
      (item.toolName === "read_file" && tools.has("read")) ||
      (item.toolName === "bash" && tools.has("bash")),
  );
}

async function frame(w: number, height = 24): Promise<void> {
  const setup = await testRender(<App c={controller} />, {
    width: w,
    height,
  });
  await act(async () => {
    await setup.flush();
  });
  const lines = setup.captureCharFrame().split("\n");
  console.log(`\n=== ${w} cols ===`);
  console.log("┌" + "─".repeat(w) + "┐");
  console.log(lines.map((l) => "│" + l.padEnd(w)).join("\n"));
  console.log("└" + "─".repeat(w) + "┘");
  act(() => setup.renderer.destroy());
}

for (const w of [60, 80, 120]) await frame(w);

if (tools) {
  controller.state.chat = multilineToolScenarios();
  controller.state.title = `multiline tools: ${[...tools].join(", ")}`;
  await frame(80, 40);
  process.exit(0);
}

controller.state.chat = multilineToolScenarios();
controller.state.title = "multiline tool outputs";
await frame(80, 40);

// Scenario: normal conversation with user / assistant / tool blocks.
controller.state.chat = [
  { kind: "user", content: "run ls" },
  {
    kind: "assistant",
    content: "The directory contains:\n\n- AGENTS.md\n- core/\n",
  },
  {
    kind: "tool",
    toolName: "bash",
    cmd: "git status",
    content: "3 lines",
    running: false,
  },
  {
    kind: "tool",
    toolName: "bash",
    cmd: "ls",
    content: "total 24\nAGENTS.md\nbun.lock",
    running: false,
    expanded: true,
  },
  {
    kind: "tool",
    toolName: "bash",
    cmd: "rm -rf /",
    content: "permission denied",
    isError: true,
    expanded: true,
  },
];
controller.state.tokens = 1200;
controller.state.title = "snapshot";
await frame(80);

// Scenario: system messages in chat (variant, errors, compaction).
controller.state.chat = [
  { kind: "user", content: "set variant to allow" },
  { kind: "meta", content: "variant set to: allow" },
  { kind: "user", content: "run a command" },
  {
    kind: "tool",
    toolName: "bash",
    cmd: "echo test",
    content: "test",
    running: false,
  },
  { kind: "meta", content: "error: connection timeout" },
  { kind: "user", content: "try again" },
  { kind: "meta", content: "context limit reached; compacting context..." },
  { kind: "meta", content: "conversation compacted" },
];
controller.state.variant = "allow";
controller.state.tokens = 85000;
controller.state.contextWindow = 100000;
controller.state.title = "system messages";
await frame(80);

// Scenario: long model name with variant in status bar.
controller.state.chat = [
  { kind: "user", content: "hello" },
  { kind: "assistant", content: "hi there" },
];
controller.state.model =
  "llama.cpp/Qwen3.8-27B-TTURBO-Fable-Craft-Thinking-Q4_K_M";
controller.state.variant = "allow";
controller.state.tokens = 5000;
controller.state.contextWindow = 32768;
controller.state.title = "long model name";
await frame(80);

// Scenario: assistant thinking before responding.
controller.state.chat = [
  { kind: "user", content: "what is the capital of Brazil?" },
  {
    kind: "thinking",
    content:
      "The user is asking about Brazilian geography. The capital is Brasília, not Rio de Janeiro.",
  },
  { kind: "assistant", content: "The capital of Brazil is Brasília." },
];
controller.state.tokens = 800;
controller.state.title = "thinking";
await frame(80);

// Scenario: user message with attached image.
controller.state.chat = [
  {
    kind: "user",
    content: "what's in this screenshot?",
    imagePaths: ["~/Downloads/error.png"],
  },
  {
    kind: "assistant",
    content: "The screenshot shows a null pointer exception at line 42.",
  },
];
controller.state.tokens = 1500;
controller.state.title = "image attachment";
await frame(80);

// Scenario: long text in input box.
controller.state.chat = [
  { kind: "user", content: "summarize this" },
  { kind: "assistant", content: "done" },
];
controller.state.input =
  "please review all the changes in the repository and make sure they follow the coding standards and are properly documented with tests";
controller.state.tokens = 2000;
controller.state.title = "long input";
await frame(80);

// Scenario: running tool with spinner.
controller.state.chat = [
  { kind: "user", content: "run tests" },
  {
    kind: "tool",
    toolName: "bash",
    cmd: "bun test",
    content: "",
    running: true,
  },
];
controller.state.busy = true;
controller.state.tokens = 3000;
controller.state.title = "tool running";
await frame(80);

// Scenario: denied tool.
controller.state.chat = [
  { kind: "user", content: "delete the database" },
  {
    kind: "tool",
    toolName: "bash",
    cmd: "rm -rf /var/lib/db",
    content: "",
    denied: true,
  },
];
controller.state.tokens = 1000;
controller.state.title = "tool denied";
await frame(80);

// Scenario: compaction in progress.
controller.state.chat = [
  { kind: "user", content: "continue" },
  { kind: "meta", content: "context limit reached; compacting context..." },
];
controller.state.compacting = true;
controller.state.tokens = 98000;
controller.state.contextWindow = 100000;
controller.state.title = "compacting";
await frame(80);

// Scenario: task panel (collapsed - default).
controller.state.chat = [
  { kind: "user", content: "implement the feature" },
  { kind: "assistant", content: "I'll create a task list." },
];
controller.state.tasks = [
  {
    id: "t1",
    title: "Plan the implementation",
    status: "completed" as const,
    evidence: "done",
  },
  { id: "t2", title: "Write the code", status: "in_progress" as const },
  { id: "t3", title: "Run tests", status: "pending" as const },
];
controller.state.tokens = 4000;
controller.state.title = "tasks collapsed";
await frame(80);

// Scenario: task panel (expanded).
controller.state.tasks = [
  {
    id: "t1",
    title: "Plan the implementation",
    status: "completed" as const,
    evidence: "done",
  },
  { id: "t2", title: "Write the code", status: "in_progress" as const },
  { id: "t3", title: "Run tests", status: "pending" as const },
  { id: "t4", title: "Deploy", status: "pending" as const },
];
controller.state.taskPanelExpanded = true;
controller.state.title = "tasks expanded";
await frame(80);

// Scenario: task panel (collapsed again after being expanded).
controller.state.taskPanelExpanded = false;
controller.state.tasks = [
  {
    id: "t1",
    title: "Plan the implementation",
    status: "completed" as const,
    evidence: "done",
  },
  { id: "t2", title: "Write the code", status: "in_progress" as const },
  { id: "t3", title: "Run tests", status: "pending" as const },
];
controller.state.title = "tasks collapsed again";
await frame(80);

// Scenario: question panel (options).
controller.state.chat = [{ kind: "user", content: "which framework?" }];
controller.state.questionRequest = {
  id: "snap-q1",
  questions: [
    {
      question: "Which framework do you prefer?",
      options: ["React", "Vue", "Svelte", "Angular"],
    },
  ],
  createdAt: new Date(),
};
controller.state.tokens = 500;
controller.state.title = "question options";
await frame(80);

// Scenario: question panel (free text).
controller.state.questionRequest = {
  id: "snap-q2",
  questions: [{ question: "What is your name?" }],
  createdAt: new Date(),
};
controller.state.title = "question text";
await frame(80);

// Scenario: question panel (multi-question progress).
controller.state.questionRequest = {
  id: "snap-q3",
  questions: [
    { question: "What is your name?" },
    {
      question: "What is your role?",
      options: ["Developer", "Designer", "Manager"],
    },
  ],
  createdAt: new Date(),
};
controller.state.title = "question multi";
await frame(80);
