import { describe, expect, test } from "bun:test";
import { InMemoryObservability } from "@cagent/sdk";
import { loadPlugins } from "../src/loader";
import { EventBus } from "../src/events";
import { Registry } from "../src/registry";

describe("plugin observability", () => {
  test("injects the shared implementation and traces plugin loading", async () => {
    const telemetry = new InMemoryObservability();
    let received: unknown;
    await loadPlugins(
      {
        log_level: "info",
        plugins: [{ name: "test-plugin", enabled: true, config: {} }],
      },
      new Registry(),
      new EventBus(),
      {
        loaders: {
          "test-plugin": (ctx) => {
            received = ctx.observability;
          },
        },
        observability: telemetry,
      },
    );

    expect(received).toBe(telemetry);
    expect(telemetry.spans.map((span) => span.name)).toEqual(["plugin.load"]);
    expect(telemetry.spans[0]?.attributes["plugin.name"]).toBe("test-plugin");
  });
});
