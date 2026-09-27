import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import React, { act, useState } from "react";
import { describe, expect, it } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { createRoot } from "@opentui/react";
import { InMemoryObservability } from "@cagent/sdk";
import { Controller, type ControllerDeps } from "../src/controller/controller";
import { EventBus } from "../src/events";
import { Registry } from "../src/registry";
import { AgentTurnBlockComponent } from "../src/ui/components/AgentTurnBlock";
import type { AgentTurnBlock as AgentTurnBlockData } from "../src/ui/render/blocks";
import { ThemeProvider } from "../src/ui/primitives/theme-context";
import { themeForTerminal } from "../src/ui/theme/themes";

function createController(observability?: InMemoryObservability): Controller {
  const deps: ControllerDeps = {
    config: {
      plugins: [],
      allowlist: [],
      model: "openai/m1",
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
    sessionDir: fs.mkdtempSync(path.join(os.tmpdir(), "cagent-buffer-")),
    observability,
  };
  return new Controller(deps);
}

function makeBlock(content: string): AgentTurnBlockData {
  return {
    type: "agent-turn",
    turnId: "turn-1",
    author: "cagent",
    timestamp: Date.now(),
    items: [{ type: "RESPONSE", content, chatIndex: 0 }],
  };
}

describe("streaming display buffer", () => {
  it("holds rapid chunks and shows everything on finalize", async () => {
    const observability = new InMemoryObservability();
    const controller = createController(observability);
    (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
    const setup = await createTestRenderer({ width: 60, height: 12 });
    const root = createRoot(setup.renderer);
    // ponytail: root.render() remounts (fresh container per call), so updates
    // go through in-tree state to exercise the real update path.
    let pushContent!: (content: string, streaming: boolean) => void;
    function Harness() {
      const [state, setState] = useState({
        content: "alpha stable",
        streaming: true,
      });
      pushContent = (content: string, streaming: boolean) =>
        setState({ content, streaming });
      return (
        <ThemeProvider value={themeForTerminal("dark", undefined)}>
          <AgentTurnBlockComponent
            block={makeBlock(state.content)}
            streaming={state.streaming}
            latestTurn
            controller={controller}
            terminalWidth={60}
          />
        </ThemeProvider>
      );
    }
    try {
      act(() => {
        root.render(<Harness />);
      });
      await setup.renderOnce();
      expect(setup.captureCharFrame()).toContain("alpha");
      // Rapid follow-up chunk on the same tick stays buffered: a single
      // render pass is far shorter than the buffer window, so unlike flush()
      // it cannot let the trailing timer fire mid-wait.
      act(() => {
        pushContent("alpha stable zebra-fresh-words", true);
      });
      await setup.renderOnce();
      expect(setup.captureCharFrame()).not.toContain("zebra");
      // A sealed line is a natural flush point: it shows immediately.
      act(() => {
        pushContent("alpha stable zebra-fresh-words\nline two\n", true);
      });
      await setup.renderOnce();
      expect(setup.captureCharFrame()).toContain("line two");
      // Finalization always shows the full content immediately.
      act(() => {
        pushContent(
          "alpha stable zebra-fresh-words\nline two\ntail three",
          false,
        );
      });
      await setup.renderOnce();
      const final = setup.captureCharFrame();
      expect(final).toContain("zebra");
      expect(final).toContain("tail three");
      // Every displayed content is counted once with the session id.
      const sets = observability.metrics.filter(
        (entry) => entry.name === "ui.chat.markdown_sets",
      );
      expect(sets.length).toBeGreaterThan(0);
      for (const entry of sets) {
        expect(entry.value).toBe(1);
        expect(entry.attributes?.session_id).toBe(controller.session.id);
      }
    } finally {
      act(() => root.unmount());
      setup.renderer.destroy();
    }
  });
});
