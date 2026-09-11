import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import React from "react";
import { describe, expect, it } from "bun:test";
import { renderToString } from "ink";
import { render } from "ink-testing-library";
import stripAnsi from "strip-ansi";
import { App } from "../src/ui/components/App";
import { EventBus } from "../src/events";
import { Registry } from "../src/registry";
import { Controller, type ControllerDeps } from "../src/controller/controller";

function deps(): ControllerDeps {
  return {
    config: { plugins: [], allowlist: [], model: "openai/m1", permissions: false } as ControllerDeps["config"],
    registry: new Registry(),
    bus: new EventBus(),
    adapter: {
      list_models: async () => ["modelo-a", "modelo-b"],
      prepare_call: async (o) => o,
      stream: async function* () {
        yield { type: "text", text: "oi" };
      },
    },
    model: "openai/m1",
    systemPrompt: "sys",
    sessionDir: fs.mkdtempSync(path.join(os.tmpdir(), "cagent-ui-")),
  };
}

describe("renderToString", () => {
  it("renderiza panes e status bar", () => {
    const c = new Controller(deps());
    const out = renderToString(React.createElement(App, { c }));
    expect(out).toContain("m1");
    expect(out).toContain("openai");
    expect(out).toContain("tok");
    expect(out).toContain("%");
  });

  it("mantém o indicador do input na mesma linha do texto", () => {
    const c = new Controller(deps());
    c.state.input = "escreva um texto longo sem quebrar o indicador";
    const previousColumns = process.stdout.columns;
    process.stdout.columns = 40;
    try {
      const lines = stripAnsi(renderToString(React.createElement(App, { c }), { columns: 40 })).split("\n");
      expect(lines.some((line) => line.includes("❯ escreva"))).toBe(true);
    } finally {
      process.stdout.columns = previousColumns;
    }
  });

  it("rola o histórico longo com a roda do mouse", async () => {
    const c = new Controller(deps());
    c.state.chat.push({
      kind: "assistant",
      content: Array.from({ length: 30 }, (_, i) => `parágrafo ${i}`).join("\n\n"),
    });
    const previousColumns = process.stdout.columns;
    const previousRows = process.stdout.rows;
    process.stdout.columns = 40;
    process.stdout.rows = 24;
    try {
      const { stdin, lastFrame } = render(React.createElement(App, { c }));
      await new Promise((r) => setTimeout(r, 30));
      const before = lastFrame();
      stdin.write("\x1b[<64;1;1M");
      await new Promise((r) => setTimeout(r, 30));
      expect(lastFrame()).not.toBe(before);
    } finally {
      process.stdout.columns = previousColumns;
      process.stdout.rows = previousRows;
    }
  });

  it("rola o input longo com a roda sobre a caixa", async () => {
    const c = new Controller(deps());
    c.state.input = Array.from({ length: 30 }, (_, i) => `palavra ${i}`).join(" ");
    const previousColumns = process.stdout.columns;
    const previousRows = process.stdout.rows;
    process.stdout.columns = 40;
    process.stdout.rows = 24;
    try {
      const { stdin, lastFrame } = render(React.createElement(App, { c }));
      await new Promise((r) => setTimeout(r, 30));
      const before = lastFrame();
      stdin.write("\x1b[<64;1;16M");
      await new Promise((r) => setTimeout(r, 30));
      expect(lastFrame()).not.toBe(before);
    } finally {
      process.stdout.columns = previousColumns;
      process.stdout.rows = previousRows;
    }
  });

  it("markdown em mensagem de assistant concluída", () => {
    const c = new Controller(deps());
    c.state.chat.push({ kind: "assistant", content: "# título\n\n- item 1\n- item 2\n" });
    const out = renderToString(React.createElement(App, { c }));
    expect(out).toContain("título");
    expect(out).toContain("•");
  });

  it("lista numerada renderiza com números e código sem markup cru", () => {
    const c = new Controller(deps());
    c.state.chat.push({
      kind: "assistant",
      content: "1. Crie uma pasta:\n2. Registre:\n\n   ```ts\n   const a = 1;\n   ```",
    });
    const out = renderToString(React.createElement(App, { c }));
    expect(out).toContain("1.");
    expect(out).toContain("2.");
    expect(out).not.toContain("<span");
    expect(out).not.toContain("hljs-");
  });

  it("tool item renderiza com cmd e dica de expandir", () => {
    const c = new Controller(deps());
    c.onToolPre({ tool: "bash", args: { command: "git status" } });
    c.onToolPost({ tool: "bash", result: { output: "linhas\na\nb" } });
    const out = renderToString(React.createElement(App, { c }));
    expect(out).toContain("bash");
    expect(out).toContain("git status");
    expect(out).toContain("ctrl+o");
  });

  it("tab completa e enter confirma o comando /... completo (sem envio incompleto)", async () => {
    const c = new Controller(deps());
    const { stdin } = render(React.createElement(App, { c }));
    stdin.write("/he");
    await new Promise((r) => setTimeout(r, 30));
    expect(c.state.input).toBe("/he");
    expect(c.state.suggest).toContain("/help");
    stdin.write("\t"); // tab completa /he -> /help
    await new Promise((r) => setTimeout(r, 30));
    expect(c.state.input).toBe("/help");
    expect(c.state.inputKey).toBe(1); // remontou o TextInput (cursor ao fim)
    stdin.write("\r"); // enter confirma o comando completo
    await new Promise((r) => setTimeout(r, 30));
    expect(c.state.helpOpen).toBe(true);
    expect(c.state.input).toBe("");
  });
});
