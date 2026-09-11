import React from "react";
import { renderToString } from "ink";
import stripAnsi from "strip-ansi";
import type { ProviderAdapter } from "@cagent/sdk";
import { App } from "../src/ui/components/App.js";
import { Controller } from "../src/controller/controller.js";
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
  model: "stub/stub-model",
  systemPrompt: "snapshot",
});
controller.state.chat = []; // estado vazio e determinístico (a ctor cria uma sessão nova)
controller.state.toolLog = [];
controller.state.tokens = 0;

function frame(w: number): void {
  process.stdout.columns = w; // App lê process.stdout.columns para a largura do Static
  const lines = stripAnsi(renderToString(<App c={controller} />, { columns: w })).split("\n");
  console.log(`\n=== ${w} cols ===`);
  console.log("┌" + "─".repeat(w) + "┐");
  console.log(lines.map((l) => "│" + l.padEnd(w)).join("\n"));
  console.log("└" + "─".repeat(w) + "┘");
}

for (const w of [60, 80, 120]) frame(w);

// estado semeado: os 3 blocos (usuário / agente / tool)
controller.state.chat = [
  { kind: "user", content: "rode ls" },
  { kind: "assistant", content: "O diretório contém:\n\n- AGENTS.md\n- core/\n" },
  { kind: "tool", toolName: "bash", cmd: "git status", content: "3 linhas", running: false },
  { kind: "tool", toolName: "bash", cmd: "ls", content: "total 24\nAGENTS.md\nbun.lock", running: false, expanded: true },
  { kind: "tool", toolName: "bash", cmd: "rm -rf /", content: "permission denied", isError: true, expanded: true },
];
controller.state.tokens = 1200;
controller.state.title = "snapshot";
frame(80);
