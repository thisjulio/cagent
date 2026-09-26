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
    config: {
      plugins: [],
      allowlist: [],
      model: "openai/m1",
      permissions: false,
    } as ControllerDeps["config"],
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
  it("Ctrl+O expands the latest Bash item without opening the diff viewer", async () => {
    const c = new Controller(deps());
    c.state.chat.push(
      { kind: "user", content: "edit files", turnId: "turn-1" },
      {
        kind: "tool",
        toolName: "edit_file",
        content: "diff",
        expanded: false,
        display: { kind: "diff", content: "+change" },
        turnId: "turn-1",
      },
      {
        kind: "tool",
        toolName: "bash",
        content: "terminal output",
        expanded: false,
        display: { kind: "terminal", stdout: "terminal output", exitCode: 0 },
        turnId: "turn-1",
      },
    );
    const setup = await testRender(React.createElement(App, { c }), {
      width: 80,
      height: 30,
    });

    await act(async () => {
      setup.mockInput.pressKey("o", { ctrl: true });
      await setup.flush();
    });

    expect(c.state.chat[2]?.expanded).toBe(true);
    expect(c.state.chat[1]?.expanded).toBe(false);
    expect(c.state.diffPanel).toBeUndefined();
    expect(setup.captureCharFrame()).not.toContain("File changes");
    act(() => setup.renderer.destroy());
  });

  it("renders panes and the status bar", async () => {
    const c = new Controller(deps());
    c.state.tokens = 100;
    c.state.inputTokens = 90;
    c.state.outputTokens = 10;
    const setup = await testRender(React.createElement(App, { c }), {
      width: 80,
      height: 24,
    });
    await act(async () => {
      c.bump();
      await setup.flush();
      await new Promise((resolve) => setTimeout(resolve, 100));
      await setup.flush();
      await new Promise((resolve) => setTimeout(resolve, 100));
      await setup.flush();
      await new Promise((resolve) => setTimeout(resolve, 100));
      await setup.flush();
    });
    const out = setup.captureCharFrame();
    expect(out).toContain("m1");
    expect(out).toContain("openai");
    expect(out).toContain("100k");
    expect(out).toContain("%");
    act(() => setup.renderer.destroy());
  });

  it("renders the MCP server count passed from bootstrap", async () => {
    const c = new Controller(deps());
    const setup = await testRender(
      React.createElement(App, { c, mcpServerCount: 2 }),
      { width: 80, height: 24 },
    );
    await act(async () => {
      await setup.flush();
    });
    expect(setup.captureCharFrame()).toContain("2 MCP");
    act(() => setup.renderer.destroy());
  });

  it("keeps expanded tool content aligned at narrow widths", async () => {
    const c = new Controller(deps());
    c.state.chat.push({
      kind: "tool",
      toolName: "bash",
      toolCategory: "shell",
      cmd: "printf",
      content: "012345678901234567890123456789",
      expanded: true,
      display: {
        kind: "terminal",
        stdout: "012345678901234567890123456789",
      },
    });
    const setup = await testRender(React.createElement(App, { c }), {
      width: 40,
      height: 24,
    });
    await act(async () => {
      c.bump();
      await setup.flush();
      await new Promise((resolve) => setTimeout(resolve, 500));
      await setup.flush();
    });
    const lines = setup
      .captureCharFrame()
      .split("\n")
      .filter((line) => line.includes("012345"));
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every((line) => line.includes("│"))).toBe(true);
    act(() => setup.renderer.destroy());
  });

  it("keeps the connector beside every line of multiline tool displays", async () => {
    const c = new Controller(deps());
    c.state.chat.push({
      kind: "tool",
      toolName: "bash",
      toolCategory: "shell",
      cmd: "printf",
      content: "first\nsecond\nthird",
      expanded: true,
      display: {
        kind: "terminal",
        stdout: "first\nsecond\nthird",
      },
    });
    const setup = await testRender(React.createElement(App, { c }), {
      width: 40,
      height: 24,
    });
    await act(async () => {
      c.bump();
      await setup.flush();
      await new Promise((resolve) => setTimeout(resolve, 100));
      await setup.flush();
    });
    const lines = setup
      .captureCharFrame()
      .split("\n")
      .filter((line) => /first|second|third/.test(line));
    expect(lines).toHaveLength(3);
    expect(lines.every((line) => line.includes("│"))).toBe(true);
    act(() => setup.renderer.destroy());
  });

  it("summarizes structured write arguments instead of printing file contents", async () => {
    const c = new Controller(deps());
    c.onToolPre({
      tool: "write_file",
      args: {
        path: "cagent-opentui-test.ts",
        content: "line one\nline two\nline three",
      },
    });
    c.onToolPost({
      tool: "write_file",
      result: {
        output: "written cagent-opentui-test.ts",
        display: {
          kind: "code",
          content: "line one\nline two\nline three",
          filetype: "typescript",
        },
      },
    });
    const setup = await testRender(React.createElement(App, { c }), {
      width: 80,
      height: 40,
    });
    await act(async () => {
      c.bump();
      await setup.flush();
      await new Promise((resolve) => setTimeout(resolve, 100));
      await setup.flush();
    });
    const collapsed = setup.captureCharFrame();
    expect(collapsed).toContain("Write cagent-opentui-test.ts");
    expect(collapsed).not.toContain("\\nline two");
    act(() => setup.renderer.destroy());
  });

  it("renders rich displays for code, diffs, and terminal output", async () => {
    const displays = [
      {
        kind: "tool",
        toolName: "read_file",
        toolCategory: "read",
        cmd: "src/app.ts",
        content: "1\tconst answer = 42",
        expanded: true,
        display: {
          kind: "code",
          content: "const answer = 42",
          filetype: "typescript",
          lineNumbers: true,
          lineStart: 4,
        },
      },
      {
        kind: "tool",
        toolName: "edit_file",
        toolCategory: "write",
        cmd: "src/app.ts",
        content: "OK src/app.ts\n-const answer = 41\n+const answer = 42",
        expanded: true,
        display: {
          kind: "diff",
          content:
            "--- a/src/app.ts\n+++ b/src/app.ts\n@@ -1,1 +1,1 @@\n-const answer = 41\n+const answer = 42",
          filetype: "typescript",
        },
      },
      {
        kind: "tool",
        toolName: "bash",
        toolCategory: "shell",
        cmd: "bun test",
        content: "ok",
        expanded: true,
        display: {
          kind: "terminal",
          stdout: "ok",
          stderr: "warning",
          exitCode: 0,
        },
      },
    ] as const;
    const expected = ["const answer = 42", "const answer = 42", "warning"];
    for (const [index, display] of displays.entries()) {
      const c = new Controller(deps());
      c.state.chat.push(display);
      const setup = await testRender(React.createElement(App, { c }), {
        width: 80,
        height: 40,
      });
      await act(async () => {
        await setup.flush();
        await new Promise((resolve) => setTimeout(resolve, 100));
        await setup.flush();
      });
      expect(setup.captureCharFrame()).toContain(expected[index]);
      act(() => setup.renderer.destroy());
    }
  });

  it("shows edit_file diffs expanded after completion", async () => {
    const c = new Controller(deps());
    c.onToolPre({
      tool: "edit_file",
      args: { path: "cagent-opentui-test.ts", blocks: "edit" },
    });
    c.onToolPost({
      tool: "edit_file",
      result: {
        output: "OK cagent-opentui-test.ts",
        display: {
          kind: "diff",
          content:
            "--- cagent-opentui-test.ts\n+++ cagent-opentui-test.ts\n@@ -1,1 +1,1 @@\n-old\n+new",
          filetype: "typescript",
          path: "cagent-opentui-test.ts",
        },
      },
    });
    const setup = await testRender(React.createElement(App, { c }), {
      width: 80,
      height: 30,
    });
    await act(async () => {
      c.bump();
      await setup.flush();
      await new Promise((resolve) => setTimeout(resolve, 100));
      await setup.flush();
    });
    const out = setup.captureCharFrame();
    expect(out).toContain("Edit cagent-opentui-test.ts");
    expect(out).toContain("1 - old");
    expect(out).toContain("1 + new");
    act(() => setup.renderer.destroy());
  });

  it("renders read results with a visible line-number gutter", async () => {
    const c = new Controller(deps());
    c.state.chat.push({
      kind: "tool",
      toolName: "read_file",
      toolCategory: "read",
      cmd: "cagent-opentui-test.ts",
      content: "4\treturn message;",
      expanded: true,
      display: {
        kind: "code",
        content: "return message;",
        filetype: "typescript",
        lineNumbers: true,
        lineStart: 4,
      },
    });
    const setup = await testRender(React.createElement(App, { c }), {
      width: 80,
      height: 30,
    });
    await act(async () => {
      c.bump();
      await setup.flush();
      await new Promise((resolve) => setTimeout(resolve, 100));
      await setup.flush();
    });
    const out = setup.captureCharFrame();
    expect(out).toContain("4");
    expect(out).toContain("return message;");
    act(() => setup.renderer.destroy());
  });

  it("keeps missing image paths as ordinary user text", async () => {
    const c = new Controller(deps());
    c.state.chat.push({ kind: "user", content: "analise ./missing-image.png" });
    const setup = await testRender(React.createElement(App, { c }), {
      width: 80,
      height: 24,
    });
    await act(async () => {
      c.bump();
      await setup.flush();
      await new Promise((resolve) => setTimeout(resolve, 100));
      await setup.flush();
    });
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
      for (let i = 0; i < 401; i++)
        appendChat(state, { kind: "meta", content: `item ${i}` });
      expect(state.chat.length).toBe(400);
      expect(writes).toEqual([]);
    } finally {
      process.stdout.write = originalWrite;
    }
  });

  it("renders thinking content", async () => {
    const c = new Controller(deps());
    c.state.chat.push({ kind: "thinking", content: "private reasoning" });
    const setup = await testRender(React.createElement(App, { c }), {
      width: 80,
      height: 24,
    });
    await act(async () => {
      await setup.flush();
      await new Promise((resolve) => setTimeout(resolve, 100));
      await setup.flush();
    });
    const out = setup.captureCharFrame();
    expect(out).toContain("▸ reasoning · 1 line");
    expect(out).not.toContain("private reasoning");
    act(() => setup.renderer.destroy());
  });

  it("keeps the input indicator on the same line as the text", async () => {
    const c = new Controller(deps());
    c.state.input = "type a long text without breaking the indicator";
    const previousColumns = process.stdout.columns;
    process.stdout.columns = 40;
    try {
      const setup = await testRender(React.createElement(App, { c }), {
        width: 40,
        height: 24,
      });
      await act(async () => {
        await setup.flush();
        await new Promise((resolve) => setTimeout(resolve, 100));
        await setup.flush();
      });
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
      content: Array.from({ length: 30 }, (_, i) => `paragraph ${i}`).join(
        "\n\n",
      ),
    });
    const previousColumns = process.stdout.columns;
    const previousRows = process.stdout.rows;
    process.stdout.columns = 40;
    process.stdout.rows = 24;
    try {
      const setup = await testRender(React.createElement(App, { c }), {
        width: 40,
        height: 24,
      });
      await act(async () => {
        await setup.flush();
        await new Promise((resolve) => setTimeout(resolve, 100));
        await setup.flush();
      });
      const before = setup.captureCharFrame();
      await act(async () => {
        setup.mockMouse.scroll(20, 8, "up");
        await new Promise((resolve) => setTimeout(resolve, 100));
        await setup.flush();
      });
      expect(setup.captureCharFrame()).not.toBe(before);
      act(() => setup.renderer.destroy());
    } finally {
      process.stdout.columns = previousColumns;
      process.stdout.rows = previousRows;
    }
  });

  it("renders markdown in a completed assistant message", async () => {
    const c = new Controller(deps());
    c.state.chat = [
      {
        kind: "assistant",
        content: "# title\n\n- item 1\n- item 2\n",
        turnId: "markdown-test",
      },
    ];
    const setup = await testRender(React.createElement(App, { c }), {
      width: 80,
      height: 24,
    });
    await act(async () => {
      await setup.flush();
      await new Promise((resolve) => setTimeout(resolve, 100));
      await setup.flush();
    });
    const out = setup.captureCharFrame();
    expect(out).toContain("title");
    expect(out).toContain("- item 1");
    act(() => setup.renderer.destroy());
  });

  it("renders numbered lists and code without raw markup", async () => {
    const c = new Controller(deps());
    c.state.chat.push({
      kind: "assistant",
      content:
        "1. Create a folder:\n2. Register it:\n\n```ts\nconst a = 1;\n```",
    });
    const setup = await testRender(React.createElement(App, { c }), {
      width: 80,
      height: 24,
    });
    await act(async () => {
      await setup.flush();
      await new Promise((resolve) => setTimeout(resolve, 100));
      await setup.flush();
    });
    const out = setup.captureCharFrame();
    expect(out).toContain("const a = 1;");
    act(() => setup.renderer.destroy());
  });

  it("renders a tool item with its command and status", async () => {
    const c = new Controller(deps());
    c.onToolPre({ tool: "bash", args: { command: "git status" } });
    c.onToolPost({ tool: "bash", result: { output: "lines\na\nb" } });
    const setup = await testRender(React.createElement(App, { c }), {
      width: 80,
      height: 24,
    });
    await act(async () => {
      await setup.flush();
    });
    const out = setup.captureCharFrame();
    expect(out).toContain("✓ Run git");
    expect(out).toContain("$ git status");
    act(() => setup.renderer.destroy());
  });

  it("renders an untitled tool command on the second line", async () => {
    const c = new Controller(deps());
    c.onToolPre({ tool: "bash", args: { command: "pwd" } });
    const setup = await testRender(React.createElement(App, { c }), {
      width: 80,
      height: 24,
    });
    await act(async () => {
      await setup.flush();
    });
    const out = setup.captureCharFrame();
    expect(out).toContain("Run pwd");
    expect(out).toContain("│ $ pwd");
    act(() => setup.renderer.destroy());
  });

  it("tab completes and enter confirms the complete /... command (without incomplete submission)", async () => {
    const c = new Controller(deps());
    const setup = await testRender(React.createElement(App, { c }), {
      width: 80,
      height: 24,
    });
    await act(async () => {
      await setup.flush();
    });
    await act(async () => setup.mockInput.typeText("/he"));
    await act(async () => {
      await setup.flush();
    });
    expect(c.state.input).toBe("/he");
    expect(c.state.suggest).toContain("/help");
    await act(async () => setup.mockInput.pressTab());
    await act(async () => {
      await setup.flush();
    });
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
    c.state.modelPicker = {
      entries: [{ route: "openai", models: ["m1", "m2"] }],
      query: "",
    };
    const setup = await testRender(React.createElement(App, { c }), {
      width: 80,
      height: 24,
    });
    await act(async () => {
      await setup.flush();
    });
    await act(async () => setup.mockInput.pressArrow("down"));
    await act(async () => setup.mockInput.pressEnter());
    await act(async () => {
      await setup.flush();
    });
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
    const setup = await testRender(React.createElement(App, { c }), {
      width: 80,
      height: 24,
    });
    await act(async () => {
      await setup.flush();
    });
    await act(async () => setup.mockInput.pressArrow("down"));
    await act(async () => setup.mockInput.pressEnter());
    await act(async () => {
      await setup.flush();
    });
    expect(c.state.sessionList).toBeNull();
    act(() => setup.renderer.destroy());
  });
});
