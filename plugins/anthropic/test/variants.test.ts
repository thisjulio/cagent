import { describe, expect, test } from "bun:test";
import { createAdapter } from "../src/adapter";

function fakeClient(capture: (params: Record<string, unknown>) => void) {
  return {
    beta: {
      messages: {
        create: async (params: Record<string, unknown>) => {
          capture(params);
          return {
            async *[Symbol.asyncIterator]() {
              yield {
                type: "message_start",
                message: { usage: { input_tokens: 1, output_tokens: 0 } },
              };
              yield {
                type: "message_delta",
                delta: { stop_reason: "end_turn" },
                usage: { output_tokens: 1 },
              };
            },
          };
        },
      },
    },
  };
}

async function capturedRequest(model: string, variant?: string) {
  let captured: Record<string, unknown> | undefined;
  const adapter = createAdapter({
    config: { auth: { kind: "api", apiKey: "test" } },
    client: fakeClient((params) => (captured = params)) as never,
  });
  const request = await adapter.prepare_call({
    model,
    variant,
    messages: [{ role: "user", content: "hello" }],
    tools: [],
  });
  for await (const _chunk of adapter.stream(request)) {
    // Consume the stream to inspect its request parameters.
  }
  return captured;
}

describe("Anthropic reasoning variants", () => {
  test("offers effort variants for Sonnet 4.6", async () => {
    const adapter = createAdapter({ config: {} });
    expect(await adapter.supported_variants?.("claude-sonnet-4-6")).toEqual([
      "low",
      "medium",
      "high",
      "max",
    ]);
  });

  test("offers effort variants for Sonnet 5", async () => {
    const adapter = createAdapter({ config: {} });
    expect(await adapter.supported_variants?.("claude-sonnet-5")).toEqual([
      "low",
      "medium",
      "high",
      "max",
    ]);
  });

  test("sends adaptive thinking and selected effort", async () => {
    const request = await capturedRequest("claude-sonnet-4-6", "medium");
    expect(request?.thinking).toEqual({ type: "adaptive" });
    expect(request?.output_config).toEqual({ effort: "medium" });
  });

  test("enables adaptive thinking by default for supported models", async () => {
    const request = await capturedRequest("claude-sonnet-4-6");
    expect(request?.thinking).toEqual({ type: "adaptive" });
    expect(request?.output_config).toBeUndefined();
  });

  test("enables adaptive thinking by default for model 5 families", async () => {
    const request = await capturedRequest("claude-sonnet-5");
    expect(request?.thinking).toEqual({ type: "adaptive" });
    expect(request?.output_config).toBeUndefined();
  });

  test("does not send adaptive thinking for legacy model families", async () => {
    const request = await capturedRequest("claude-3-7-sonnet-20250219", "high");
    expect(request?.thinking).toBeUndefined();
    expect(request?.output_config).toBeUndefined();
  });
});
