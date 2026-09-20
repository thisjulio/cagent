import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { InMemoryObservability } from "@cagent/sdk";
import { EventBus } from "../src/events";
import { Registry } from "../src/registry";
import { Controller, type ControllerDeps } from "../src/controller/controller";
import { Session } from "../src/session/index";

function dependencies(observability: InMemoryObservability): ControllerDeps {
  return {
    config: {
      plugins: [],
      allowlist: [],
      model: "openai/m1",
      permissions: false,
      context_recent_messages: 4,
    },
    registry: new Registry(),
    bus: new EventBus(),
    adapter: {
      list_models: async () => ["m1"],
      prepare_call: async (options) => options,
      stream: async function* () {
        yield { type: "text", text: "ok" };
        yield {
          type: "finish",
          finish_reason: "stop",
          usage: { input_tokens: 10, output_tokens: 2 },
        };
      },
    },
    model: "openai/m1",
    systemPrompt: "system",
    sessionDir: fs.mkdtempSync(path.join(os.tmpdir(), "cagent-prompt-")),
    observability,
  };
}

describe("prompt.assembled workflow event", () => {
  it("emits on the event bus independently of observability", async () => {
    const observability = new InMemoryObservability();
    const deps = dependencies(observability);
    const events: unknown[] = [];
    deps.bus.on("prompt.assembled", (payload) => events.push(payload));
    const controller = new Controller(deps);
    controller.state.title = "Existing title";

    await controller.submit("hello");

    expect(events).toHaveLength(1);
    expect(
      observability.events.some((event) => event.name === "prompt.assembled"),
    ).toBe(true);
  });

  it("keeps the full request and retains the transcript in JSONL", async () => {
    const observability = new InMemoryObservability();
    const deps = dependencies(observability);
    deps.config.context_recent_messages = 2;
    const controller = new Controller(deps);
    controller.state.title = "Existing title";

    for (const fact of ["FACT_01", "FACT_02", "FACT_03", "FACT_04"]) {
      await controller.submit(fact);
    }

    const assembled = observability.events
      .filter((event) => event.name === "prompt.assembled")
      .at(-1);
    expect(assembled?.attributes).toMatchObject({
      "context.included": 8,
      "context.omitted": 0,
      "context.recent_turns": 0,
    });
    expect(
      fs
        .readFileSync(controller.session.file, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line).payload.content)
        .filter(Boolean),
    ).toEqual([
      "FACT_01",
      "ok",
      "FACT_02",
      "ok",
      "FACT_03",
      "ok",
      "FACT_04",
      "ok",
    ]);

    const loaded = new Session(controller.session.id, deps.sessionDir).load();
    expect(loaded.messages.map((message) => message.content)).toEqual([
      "FACT_01",
      "ok",
      "FACT_02",
      "ok",
      "FACT_03",
      "ok",
      "FACT_04",
      "ok",
    ]);
  });
});
