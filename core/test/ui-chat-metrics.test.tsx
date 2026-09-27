import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import React, { act } from "react";
import { describe, expect, it } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { InMemoryObservability } from "@cagent/sdk";
import { Controller, type ControllerDeps } from "../src/controller/controller";
import { EventBus } from "../src/events";
import { Registry } from "../src/registry";
import { appendChat } from "../src/controller/chat-buffer";
import { ChatViewport } from "../src/ui/components/ChatViewport";
import { ThemeProvider } from "../src/ui/primitives/theme-context";
import { themeForTerminal } from "../src/ui/theme/themes";

function createController(observability: InMemoryObservability): Controller {
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
    sessionDir: fs.mkdtempSync(path.join(os.tmpdir(), "cagent-metrics-")),
    observability,
  };
  return new Controller(deps);
}

describe("ui.chat metrics", () => {
  it("tags render metrics with the session id", async () => {
    const observability = new InMemoryObservability();
    const controller = createController(observability);
    appendChat(controller.state, {
      kind: "assistant",
      content: "hello",
      turnId: "turn-1",
    });
    const setup = await testRender(
      <ThemeProvider value={themeForTerminal("dark", undefined)}>
        <ChatViewport
          chat={controller.state.chat}
          busy={false}
          controller={controller}
          version={controller.state.chatVersion}
        />
      </ThemeProvider>,
      { width: 60, height: 12 },
    );
    await act(async () => setup.flush());
    const metric = observability.metrics.find(
      (entry) => entry.name === "ui.chat.blocks_ms",
    );
    expect(metric).toBeDefined();
    expect(metric?.attributes?.session_id).toBe(controller.session.id);
    act(() => setup.renderer.destroy());
  });
});
