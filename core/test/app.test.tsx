import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import React from "react";
import { act } from "react";
import { describe, expect, it } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
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

describe("OpenTUI render", () => {
  it("renderiza panes e status bar", async () => {
    const c = new Controller(deps());
    const setup = await testRender(React.createElement(App, { c }), { width: 80, height: 24 });
    await act(async () => { await setup.flush(); });
    const out = setup.captureCharFrame();
    expect(out).toContain("m1");
    expect(out).toContain("openai");
    expect(out).toContain("tok");
    expect(out).toContain("%");
    act(() => setup.renderer.destroy());
  });

  it("mantém o indicador do input na mesma linha do texto", async () => {
    const c = new Controller(deps());
    c.state.input = "escreva um texto longo sem quebrar o indicador";
    const previousColumns = process.stdout.columns;
    process.stdout.columns = 40;
    try {
      const setup = await testRender(React.createElement(App, { c }), { width: 40, height: 24 });
      await act(async () => { await setup.flush(); });
      const lines = setup.captureCharFrame().split("\n");
      expect(lines.some((line) => line.includes("> escreva"))).toBe(true);
      act(() => setup.renderer.destroy());
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
      const setup = await testRender(React.createElement(App, { c }), { width: 40, height: 24 });
      await act(async () => { await setup.flush(); });
      const before = setup.captureCharFrame();
      await act(async () => setup.mockMouse.scroll(1, 1, "up"));
      await act(async () => { await setup.flush(); });
      expect(setup.captureCharFrame()).not.toBe(before);
      act(() => setup.renderer.destroy());
    } finally {
      process.stdout.columns = previousColumns;
      process.stdout.rows = previousRows;
    }
  });

  it("markdown em mensagem de assistant concluída", async () => {
    const c = new Controller(deps());
    c.state.chat.push({ kind: "assistant", content: "# título\n\n- item 1\n- item 2\n" });
    const setup = await testRender(React.createElement(App, { c }), { width: 80, height: 24 });
    await act(async () => { await setup.flush(); });
    const out = setup.captureCharFrame();
    expect(out).toContain("título");
    expect(out).toContain("- item 1");
      act(() => setup.renderer.destroy());
  });

  it("lista numerada renderiza com números e código sem markup cru", async () => {
    const c = new Controller(deps());
    c.state.chat.push({
      kind: "assistant",
      content: "1. Crie uma pasta:\n2. Registre:\n\n```ts\nconst a = 1;\n```",
    });
    const setup = await testRender(React.createElement(App, { c }), { width: 80, height: 24 });
    await act(async () => { await setup.flush(); });
    const out = setup.captureCharFrame();
    expect(out).toContain("1.");
    expect(out).toContain("2.");
    expect(out).toContain("const a = 1;");
    act(() => setup.renderer.destroy());
  });

  it("tool item renderiza com cmd e dica de expandir", async () => {
    const c = new Controller(deps());
    c.onToolPre({ tool: "bash", args: { command: "git status" } });
    c.onToolPost({ tool: "bash", result: { output: "linhas\na\nb" } });
    const setup = await testRender(React.createElement(App, { c }), { width: 80, height: 24 });
    await act(async () => { await setup.flush(); });
    const out = setup.captureCharFrame();
    expect(out).toContain("bash");
    expect(out).toContain("git status");
    expect(out).toContain("ctrl+o");
    act(() => setup.renderer.destroy());
  });

  it("tab completa e enter confirma o comando /... completo (sem envio incompleto)", async () => {
    const c = new Controller(deps());
    const setup = await testRender(React.createElement(App, { c }), { width: 80, height: 24 });
    await act(async () => { await setup.flush(); });
    await act(async () => setup.mockInput.typeText("/he"));
    await act(async () => { await setup.flush(); });
    expect(c.state.input).toBe("/he");
    expect(c.state.suggest).toContain("/help");
    await act(async () => setup.mockInput.pressTab());
    await act(async () => { await setup.flush(); });
    expect(c.state.input).toBe("/help");
    expect(c.state.inputKey).toBe(1); // remontou o TextInput (cursor ao fim)
    await act(async () => setup.mockInput.pressEnter());
    await setup.waitFor(() => c.state.helpOpen);
    expect(c.state.helpOpen).toBe(true);
    expect(c.state.input).toBe("");
    act(() => setup.renderer.destroy());
  });

  it("navega e confirma o seletor de modelos", async () => {
    const d = deps();
    d.registry.registerProvider("openai", d.adapter);
    const c = new Controller(d);
    c.state.modelPicker = { entries: [{ route: "openai", models: ["m1", "m2"] }], query: "" };
    const setup = await testRender(React.createElement(App, { c }), { width: 80, height: 24 });
    await act(async () => { await setup.flush(); });
    await act(async () => setup.mockInput.pressArrow("down"));
    await act(async () => setup.mockInput.pressEnter());
    await act(async () => { await setup.flush(); });
    expect(c.state.modelPicker).toBeNull();
    expect(c.state.model).toBe("openai/m2");
    act(() => setup.renderer.destroy());
  });

  it("navega e confirma o seletor de sessoes", async () => {
    const c = new Controller(deps());
    c.state.sessionList = [
      { id: c.session.id, updated: "2026-01-01T00:00:00", title: "uma" },
      { id: c.session.id, updated: "2026-01-02T00:00:00", title: "duas" },
    ];
    const setup = await testRender(React.createElement(App, { c }), { width: 80, height: 24 });
    await act(async () => { await setup.flush(); });
    await act(async () => setup.mockInput.pressArrow("down"));
    await act(async () => setup.mockInput.pressEnter());
    await act(async () => { await setup.flush(); });
    expect(c.state.sessionList).toBeNull();
    act(() => setup.renderer.destroy());
  });
});
