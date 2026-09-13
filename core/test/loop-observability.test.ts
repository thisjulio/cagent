import { describe, expect, test } from "bun:test";
import { InMemoryObservability } from "@cagent/sdk";
import { streamOnce } from "../src/loop";

describe("loop observability", () => {
  test("records provider preparation and streaming metrics", async () => {
    const telemetry = new InMemoryObservability();
    const adapter = {
      prepare_call: async (request: any) => request,
      async *stream() {
        yield { type: "text" as const, text: "hello" };
        yield { type: "finish" as const, finish_reason: "stop", usage: { input_tokens: 3, output_tokens: 1 } };
      },
      list_models: async () => ["test"],
    };

    const result = await streamOnce({ adapter, model: "test", messages: [], tools: [], observability: telemetry });
    expect(result.text).toBe("hello");
    expect(telemetry.spans.map((span) => span.name)).toEqual(["provider.prepare_call", "provider.stream"]);
    expect(telemetry.spans[1]?.attributes["provider.stream.chunks"]).toBe(2);
    expect(telemetry.spans[1]?.attributes["provider.stream.time_to_first_chunk_ms"]).toBeGreaterThanOrEqual(0);
  });
});
