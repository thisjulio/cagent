import React from "react";
import { render } from "ink-testing-library";
import stripAnsi from "strip-ansi";
import type { ProviderAdapter } from "@cagent/sdk";
import { App, Controller } from "../src/app.js";
import { EventBus } from "../src/events.js";
import { Registry } from "../src/registry.js";
import { loadConfig } from "../src/config.js";

// stub de provedor: o snapshot só renderiza, nunca chama o LLM
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
  model: "stub-model",
  systemPrompt: "snapshot",
});
controller.state.chat = []; // estado vazio e determinístico (a ctor carrega a última sessão)
controller.state.toolLog = [];
controller.state.tokens = 0;

const widths = [60, 80, 120];
for (const w of widths) {
  process.stdout.columns = w;
  const { lastFrame } = render(<App c={controller} />);
  console.log(`\n=== ${w} cols ===`);
  console.log("┌" + "─".repeat(w) + "┐");
  console.log(stripAnsi(lastFrame()!).split("\n").map((l) => "│" + l.padEnd(w)).join("\n"));
  console.log("└" + "─".repeat(w) + "┘");
}
