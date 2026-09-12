import React, { act } from "react";
import { testRender } from "@opentui/react/test-utils";
import type { ProviderAdapter } from "@cagent/sdk";
import { App } from "../src/ui/components/App.js";
import { Controller } from "../src/controller/controller.js";
import { EventBus } from "../src/events.js";
import { Registry } from "../src/registry.js";
import { loadConfig } from "../src/config.js";

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

async function frame(w: number): Promise<void> {
  const setup = await testRender(<App c={controller} />, { width: w, height: 24 });
  await act(async () => { await setup.flush(); });
  const lines = setup.captureCharFrame().split("\n");
  console.log(`\n=== ${w} cols ===`);
  console.log("┌" + "─".repeat(w) + "┐");
  console.log(lines.map((l) => "│" + l.padEnd(w)).join("\n"));
  console.log("└" + "─".repeat(w) + "┘");
  act(() => setup.renderer.destroy());
}

for (const w of [60, 80, 120]) await frame(w);

// Seeded state: the three blocks (user / assistant / tool).
controller.state.chat = [
  { kind: "user", content: "run ls" },
  { kind: "assistant", content: "The directory contains:\n\n- AGENTS.md\n- core/\n" },
  { kind: "tool", toolName: "bash", cmd: "git status", content: "3 lines", running: false },
  { kind: "tool", toolName: "bash", cmd: "ls", content: "total 24\nAGENTS.md\nbun.lock", running: false, expanded: true },
  { kind: "tool", toolName: "bash", cmd: "rm -rf /", content: "permission denied", isError: true, expanded: true },
];
controller.state.tokens = 1200;
controller.state.title = "snapshot";
await frame(80);
