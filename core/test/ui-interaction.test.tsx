import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import React, { act } from "react";
import { describe, expect, it } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { Controller, type ControllerDeps } from "../src/controller/controller";
import { EventBus } from "../src/events";
import { Registry } from "../src/registry";
import { App } from "../src/ui/components/App";
import { getHelpCatalog } from "../src/ui/help-catalog";

function createController(permissions = false): Controller {
  const deps: ControllerDeps = {
    config: {
      plugins: [],
      allowlist: [],
      model: "openai/m1",
      permissions,
    } as ControllerDeps["config"],
    registry: new Registry(),
    bus: new EventBus(),
    adapter: {
      list_models: async () => [],
      prepare_call: async (options) => options,
      stream: async function* () {},
    },
    model: "openai/m1",
    systemPrompt: "system",
    sessionDir: fs.mkdtempSync(path.join(os.tmpdir(), "cagent-ui-")),
  };
  return new Controller(deps);
}

const bashTool = {
  name: "bash",
  description: "Run a shell command",
  parameters: { type: "object", properties: {} },
  execute: async () => ({ output: "" }),
} as Parameters<Controller["ask"]>[0];

describe("focused UI keyboard behavior", () => {
  it("routes only implemented approval actions", async () => {
    const controller = createController(true);
    const denied = controller.ask(bashTool, { command: "echo safe" });
    const setup = await testRender(
      React.createElement(App, { c: controller }),
      { width: 80, height: 24 },
    );
    await act(async () => {
      await setup.flush();
    });
    expect(setup.captureCharFrame()).toContain("y allow · n deny");
    expect(setup.captureCharFrame()).not.toContain("e deny");

    await act(async () => {
      setup.mockInput.pressKey("e");
      await setup.flush();
    });
    expect(controller.state.pendingAsk).not.toBeNull();
    await act(async () => {
      setup.mockInput.pressKey("n");
      await setup.flush();
    });
    await expect(denied).resolves.toBe(false);

    const allowed = controller.ask(bashTool, { command: "echo safe" });
    await act(async () => {
      setup.mockInput.pressKey("y");
      await setup.flush();
    });
    await expect(allowed).resolves.toBe(true);
    act(() => setup.renderer.destroy());
  });

  it("routes Ctrl+O and Shift+Ctrl+O to the active diff inspector", async () => {
    const controller = createController();
    controller.state.chat = ["one", "two", "three"].map((name) => ({
      kind: "tool" as const,
      toolName: "edit_file",
      content: name,
      cmd: `${name}.ts`,
      changesWorkspace: true,
      display: {
        kind: "diff" as const,
        content: `+${name}`,
        path: `${name}.ts`,
      },
    }));
    controller.openToolViewer();
    const setup = await testRender(
      React.createElement(App, { c: controller }),
      {
        width: 80,
        height: 24,
      },
    );
    await act(async () => setup.flush());

    await act(async () => {
      setup.mockInput.pressKey("o", { ctrl: true });
      await setup.flush();
    });
    expect(controller.state.toolViewerIndex).toBe(1);
    expect(setup.captureCharFrame()).toContain("two.ts");

    await act(async () =>
      controller.handleKey({ ctrl: true, shift: true }, "o"),
    );
    await act(async () => setup.flush());
    expect(controller.state.toolViewerIndex).toBe(2);
    expect(setup.captureCharFrame()).toContain("three.ts");
    act(() => setup.renderer.destroy());
  });

  it("keeps the selected command visible after navigating past the first page", async () => {
    const controller = createController();
    controller.openCommandPalette();
    controller.state.commandPaletteIndex = 14;
    const setup = await testRender(
      React.createElement(App, { c: controller }),
      {
        width: 80,
        height: 24,
      },
    );

    await act(async () => {
      setup.mockInput.pressArrow("down");
      await setup.flush();
    });
    const item = getHelpCatalog({})[15];
    expect(controller.state.commandPaletteIndex).toBe(15);
    const frame = setup.captureCharFrame();
    expect(item).toBeDefined();
    expect(frame).toContain("16/21");
    expect(frame).toContain(item?.name ?? "");
    expect(frame).toContain("›");
    act(() => setup.renderer.destroy());
  });

  it("routes Tab to the active session picker scope", async () => {
    const controller = createController();
    controller.state.sessionList = [
      {
        id: "session-1",
        updated: "2026-01-01T00:00:00",
        title: "First session",
        messageCount: 2,
      },
    ];
    const setup = await testRender(
      React.createElement(App, { c: controller }),
      { width: 80, height: 24 },
    );
    await act(async () => {
      setup.mockInput.pressTab();
      await setup.flush();
    });
    expect(controller.state.sessionScope).toBe("all");
    expect(setup.captureCharFrame()).toContain("scope: all");
    act(() => setup.renderer.destroy());
  });

  it("keeps the question prompt above the status bar", async () => {
    const controller = createController();
    controller.state.questionRequest = {
      id: "question-1",
      createdAt: new Date(),
      questions: [
        {
          question: "Choose a format",
          options: ["Option A", "Option B"],
        },
      ],
    };
    const setup = await testRender(
      React.createElement(App, { c: controller }),
      { width: 80, height: 24 },
    );
    await act(async () => setup.flush());

    const lines = setup.captureCharFrame().split("\n");
    const promptRow = lines.findIndex((line) =>
      line.includes("Choose a format"),
    );
    const optionRow = lines.findIndex((line) => line.includes("Option A"));
    const statusRow = lines.findIndex((line) =>
      line.includes("permissions disabled"),
    );
    const lastVisibleRow = lines.findLastIndex(
      (line) => line.trim().length > 0,
    );
    expect(promptRow).toBeGreaterThan(-1);
    expect(optionRow).toBeGreaterThan(promptRow);
    expect(statusRow).toBeGreaterThan(optionRow);
    expect(statusRow).toBe(lastVisibleRow);
    act(() => setup.renderer.destroy());
  });

  it("opens the command palette from the help surface as advertised", async () => {
    const controller = createController();
    controller.state.helpOpen = true;
    const setup = await testRender(
      React.createElement(App, { c: controller }),
      { width: 80, height: 24 },
    );
    await act(async () => {
      setup.mockInput.pressKey("p", { ctrl: true });
      await setup.flush();
    });
    expect(controller.state.helpOpen).toBe(false);
    expect(controller.state.commandPaletteOpen).toBe(true);
    act(() => setup.renderer.destroy());
  });

  it("shows actionable LSP and context warnings without repeating context state", async () => {
    const controller = createController();
    controller.state.tokens = 91;
    controller.state.contextWindow = 100;
    controller.state.lspServers = [
      { language: "py", binary: "pyright", version: "-", status: "missing" },
    ];
    const setup = await testRender(
      React.createElement(App, { c: controller }),
      { width: 80, height: 24 },
    );
    await act(async () => setup.flush());
    const frame = setup.captureCharFrame();
    expect(frame).toContain("LSP:");
    expect(frame).toContain("py");
    expect(frame).toContain("91%");
    expect(frame.match(/91%/g)).toHaveLength(1);
    act(() => setup.renderer.destroy());
  });

  it("routes PageUp and PageDown to transcript paging", async () => {
    const controller = createController();
    const previousColumns = process.stdout.columns;
    const previousRows = process.stdout.rows;
    process.stdout.columns = 60;
    process.stdout.rows = 24;
    controller.state.chat.push(
      ...Array.from({ length: 60 }, (_, index) => ({
        kind: "assistant" as const,
        turnId: `turn-${index}`,
        content: `paragraph ${index}`,
      })),
    );
    const setup = await testRender(
      React.createElement(App, { c: controller }),
      {
        width: 60,
        height: 24,
      },
    );
    await act(async () => setup.flush());
    await new Promise((resolve) => setTimeout(resolve, 100));
    await act(async () => setup.flush());
    const bottom = setup.captureCharFrame();
    await act(async () => {
      setup.mockInput.pressKey("\u001b[5~");
      await setup.flush();
    });
    const upper = setup.captureCharFrame();
    expect(upper).not.toBe(bottom);

    await act(async () => {
      setup.mockInput.pressKey("\u001b[6~");
      await setup.flush();
    });
    const pageDown = setup.captureCharFrame();
    expect(pageDown).not.toBe(upper);
    act(() => setup.renderer.destroy());
    process.stdout.columns = previousColumns;
    process.stdout.rows = previousRows;
  });

  it("preserves transcript position and reports new lines while scrolled up", async () => {
    const controller = createController();
    const message = {
      kind: "assistant" as const,
      turnId: "streaming-turn",
      content: Array.from(
        { length: 60 },
        (_, index) => `stream line ${index}`,
      ).join("\n"),
    };
    controller.state.chat.push(message);
    const setup = await testRender(
      React.createElement(App, { c: controller }),
      { width: 60, height: 12 },
    );
    await act(async () => setup.flush());
    await new Promise((resolve) => setTimeout(resolve, 100));
    await act(async () => setup.flush());
    await act(async () => {
      setup.mockInput.pressKey("\u001b[5~");
      await setup.flush();
    });
    const readingPosition = setup.captureCharFrame();

    message.content +=
      "\n" +
      Array.from({ length: 8 }, (_, index) => `new stream line ${index}`).join(
        "\n",
      );
    await act(async () => {
      controller.bump();
      await setup.flush();
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    await act(async () => setup.flush());
    const frame = setup.captureCharFrame();
    expect(frame).toContain("new");
    expect(frame).toContain("follow");
    expect(frame).not.toBe(readingPosition);
    act(() => setup.renderer.destroy());
  });

  it("pages the active diff inspector without scrolling the transcript", async () => {
    const controller = createController();
    controller.state.chat.push({
      kind: "tool",
      toolName: "edit_file",
      cmd: "long.ts",
      content: "long diff",
      changesWorkspace: true,
      display: {
        kind: "diff",
        path: "long.ts",
        content: `--- a/long.ts\n+++ b/long.ts\n@@ -0,0 +1,40 @@\n${Array.from(
          { length: 40 },
          (_, index) => `+line ${index}`,
        ).join("\n")}`,
      },
    });
    controller.openToolViewer();
    const setup = await testRender(
      React.createElement(App, { c: controller }),
      { width: 60, height: 24 },
    );
    await act(async () => setup.flush());
    const firstPage = setup.captureCharFrame();
    await act(async () => {
      setup.mockInput.pressKey("\u001b[6~");
      await setup.flush();
    });
    expect(setup.captureCharFrame()).not.toBe(firstPage);
    act(() => setup.renderer.destroy());
  });
});
