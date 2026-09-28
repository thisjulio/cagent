import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import React, { act } from "react";
import { describe, expect, it } from "bun:test";
import { Controller, type ControllerDeps } from "../src/controller/controller";
import { EventBus } from "../src/events";
import { Registry } from "../src/registry";
import { App } from "../src/ui/components/App";
import { actUntilFrame, testRender } from "./ui-test-harness";

function controller(): Controller {
  const deps: ControllerDeps = {
    config: {
      plugins: [],
      allowlist: [],
      model: "openai/m1",
      permissions: false,
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
    sessionDir: fs.mkdtempSync(path.join(os.tmpdir(), "cagent-tool-output-")),
  };
  return new Controller(deps);
}

describe("tool output UI", () => {
  it("wraps the complete command to window width and expands all output", async () => {
    const segments = Array.from(
      { length: 24 },
      (_, index) => `segment-${String(index + 1).padStart(2, "0")}`,
    );
    const command = `echo --token=private-value ${segments.join(" ")} COMMAND_END`;
    const output = Array.from(
      { length: 18 },
      (_, index) => `output line ${index + 1}`,
    ).join("\n");
    const commandRows: number[] = [];

    for (const width of [80, 40]) {
      const c = controller();
      c.onToolPre({ tool: "bash", args: { command } });
      c.onToolPost({
        tool: "bash",
        result: {
          output,
          display: { kind: "terminal", stdout: output, exitCode: 0 },
        },
      });
      const setup = await testRender(React.createElement(App, { c }), {
        width,
        height: 50,
      });
      await act(async () => setup.flush());
      const collapsed = setup.captureCharFrame();
      expect(collapsed).toContain("COMMAND_END");
      expect(collapsed).toContain("--token=[redacted]");
      expect(collapsed).not.toContain("private-value");
      expect(collapsed).toContain("output line 1");
      expect(collapsed).toContain("15 more lines");
      commandRows.push(
        collapsed.split("\n").filter((line) => line.includes("segment-"))
          .length,
      );

      const expanded = await actUntilFrame(
        setup,
        () => setup.mockInput.pressKey("o", { ctrl: true }),
        "output line 18",
      );
      expect(expanded).not.toContain("15 more lines");
      act(() => setup.renderer.destroy());
    }

    expect(commandRows[1]).toBeGreaterThan(commandRows[0] ?? 0);
  });
});
