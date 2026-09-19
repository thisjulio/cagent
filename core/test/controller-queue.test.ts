import { describe, expect, test } from "bun:test";
import { Controller } from "../src/controller/controller";
import { EventBus } from "../src/events";
import { Registry } from "../src/registry";
import type { ControllerDeps } from "../src/controller/state";

function dependencies(): ControllerDeps {
  return {
    config: {
      plugins: [],
      allowlist: [],
      model: "stub/model",
      permissions: false,
    } as ControllerDeps["config"],
    registry: new Registry(),
    bus: new EventBus(),
    adapter: {
      list_models: async () => ["model"],
      prepare_call: async (options) => options,
      stream: async function* () {
        yield { type: "text", text: "ok" };
      },
    },
    model: "stub/model",
    systemPrompt: "system",
  };
}

describe("controller message queue", () => {
  test("accepts normal messages while a turn is busy", async () => {
    const controller = new Controller(dependencies());
    controller.state.busy = true;

    await controller.submit("follow up");

    expect(controller.state.chat.at(-1)).toMatchObject({
      kind: "user",
      content: "follow up",
      queueStatus: "queued",
    });
    expect(controller.queuedMessages()).toEqual([
      expect.objectContaining({ content: "follow up", status: "queued" }),
    ]);
  });
});
