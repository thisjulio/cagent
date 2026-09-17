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
import { appendChat } from "../src/controller/chat-buffer";

function deps(): ControllerDeps {
  return {
    config: { plugins: [], allowlist: [], model: "openai/m1", permissions: false } as ControllerDeps["config"],
    registry: new Registry(),
    bus: new EventBus(),
    adapter: {
      list_models: async () => ["model-a", "model-b"],
      prepare_call: async (o) => o,
      stream: async function* () {
        yield { type: "text", text: "hi" };
      },
    },
    model: "openai/m1",
    systemPrompt: "sys",
    sessionDir: fs.mkdtempSync(path.join(os.tmpdir(), "cagent-ui-")),
  };
}

describe("OpenTUI render", () => {
  it("renders panes and the status bar", async () => {
    const c = new Controller(deps());
    c.state.tokens = 100;
    c.state.inputTokens = 90;
    c.state.outputTokens = 10;
    const setup = await testRender(React.createElement(App, { c }), { width: 80, height: 24 });
    await act(async () => { await setup.flush(); });
    const out = setup.captureCharFrame();
    expect(out).toContain("m1");
    expect(out).toContain("openai");
    expect(out).toContain("100/100000");
    expect(out).toContain("%");
    act(() => setup.renderer.destroy());
  });

  it("keeps missing image paths as ordinary user text", async () => {
    const c = new Controller(deps());
    c.state.chat.push({ kind: "user", content: "analise ./missing-image.png" });
    const setup = await testRender(React.createElement(App, { c }), { width: 80, height: 24 });
    await act(async () => { await setup.flush(); });
    const out = setup.captureCharFrame();
    expect(out).toContain("analise ./missing-image.png");
    expect(out).not.toContain("[Image: ./missing-image.png]");
    act(() => setup.renderer.destroy());
  });

  it("does not write terminal clear sequences when chat history is capped", () => {
    const c = new Controller(deps());
    const state = c.state;
    const originalWrite = process.stdout.write;
    const writes: string[] = [];
    process.stdout.write = ((chunk: string | Uint8Array) => {
      writes.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
    try {
      for (let i = 0; i < 401; i++) appendChat(state, { kind: "meta", content: `item ${i}` });
      expect(state.chat.length).toBe(400);
      expect(writes).toEqual([]);
    } finally {
      process.stdout.write = originalWrite;
    }
  });

  it("renders thinking content", async () => {
    const c = new Controller(deps());
    c.state.chat.push({ kind: "thinking", content: "private reasoning" });
    const setup = await testRender(React.createElement(App, { c }), { width: 80, height: 24 });
    await act(async () => { await setup.flush(); });
    const out = setup.captureCharFrame();
    expect(out).toContain("thinking");
    expect(out).toContain("├─");
    expect(out).toContain("│");
    expect(out).toContain("private reasoning");
    expect(out).not.toContain("private reasoning\n\n");
    act(() => setup.renderer.destroy());
  });

  it("keeps the input indicator on the same line as the text", async () => {
    const c = new Controller(deps());
    c.state.input = "type a long text without breaking the indicator";
    const previousColumns = process.stdout.columns;
    process.stdout.columns = 40;
    try {
      const setup = await testRender(React.createElement(App, { c }), { width: 40, height: 24 });
      await act(async () => { await setup.flush(); });
      const lines = setup.captureCharFrame().split("\n");
      expect(lines.some((line) => line.includes("> type"))).toBe(true);
      act(() => setup.renderer.destroy());
    } finally {
      process.stdout.columns = previousColumns;
    }
  });

  it("scrolls long history with the mouse wheel", async () => {
    const c = new Controller(deps());
    c.state.chat.push({
      kind: "assistant",
       content: Array.from({ length: 30 }, (_, i) => `paragraph ${i}`).join("\n\n"),
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

  it("renders markdown in a completed assistant message", async () => {
    const c = new Controller(deps());
     c.state.chat.push({ kind: "assistant", content: "# title\n\n- item 1\n- item 2\n" });
    const setup = await testRender(React.createElement(App, { c }), { width: 80, height: 24 });
    await act(async () => { await setup.flush(); });
    const out = setup.captureCharFrame();
     expect(out).toContain("title");
    expect(out).toContain("- item 1");
      act(() => setup.renderer.destroy());
  });

  it("renders numbered lists and code without raw markup", async () => {
    const c = new Controller(deps());
    c.state.chat.push({
      kind: "assistant",
       content: "1. Create a folder:\n2. Register it:\n\n```ts\nconst a = 1;\n```",
    });
    const setup = await testRender(React.createElement(App, { c }), { width: 80, height: 24 });
    await act(async () => { await setup.flush(); });
    const out = setup.captureCharFrame();
    expect(out).toContain("1.");
    expect(out).toContain("2.");
    expect(out).toContain("const a = 1;");
    act(() => setup.renderer.destroy());
  });

  it("renders a tool item with its command and expand hint", async () => {
    const c = new Controller(deps());
    c.onToolPre({ tool: "bash", args: { command: "git status" } });
     c.onToolPost({ tool: "bash", result: { output: "lines\na\nb" } });
    const setup = await testRender(React.createElement(App, { c }), { width: 80, height: 24 });
    await act(async () => { await setup.flush(); });
    const out = setup.captureCharFrame();
    expect(out).toContain("bash");
    expect(out).toContain("git status");
    expect(out).toContain("ctrl+o");
    act(() => setup.renderer.destroy());
  });

  it("tab completes and enter confirms the complete /... command (without incomplete submission)", async () => {
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

  it("navigates and confirms the model selector", async () => {
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

  it("navigates and confirms the session selector", async () => {
    const c = new Controller(deps());
    c.state.sessionList = [
       { id: c.session.id, updated: "2026-01-01T00:00:00", title: "one" },
       { id: c.session.id, updated: "2026-01-02T00:00:00", title: "two" },
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
