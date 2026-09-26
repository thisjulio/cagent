import { describe, expect, test } from "bun:test";
import { InMemoryObservability } from "@cagent/sdk";
import { streamMessages } from "../src/stream";

function rejectedClient(error: Error) {
  return {
    beta: {
      messages: {
        create: async () => {
          throw error;
        },
      },
    },
  };
}

describe("Anthropic request telemetry", () => {
  test("records request shape and API request ID without prompt contents", async () => {
    const observability = new InMemoryObservability();
    const error = Object.assign(
      new Error(
        "400 invalid_request_error: This model does not support assistant message prefill.",
      ),
      { status: 400, request_id: "req_test_123" },
    );
    const request = {
      model: "claude-sonnet-5",
      variant: "high",
      messages: [{ role: "user" as const, content: "private prompt text" }],
      tools: [],
    };

    try {
      for await (const _chunk of streamMessages(
        rejectedClient(error) as never,
        request,
        { max_tokens: 128, observability },
      )) {
        // Consume the generator to trigger the rejected API call.
      }
      throw new Error("Expected provider call to fail");
    } catch (caught) {
      expect(caught).toBe(error);
    }

    expect(observability.spans).toHaveLength(1);
    expect(observability.spans[0].name).toBe("provider.anthropic.request");
    expect(observability.spans[0].attributes).toMatchObject({
      "provider.model": "claude-sonnet-5",
      "provider.variant": "high",
      "anthropic.request.message_count": 1,
      "anthropic.request.assistant_final": false,
      "anthropic.request.auth_kind": "api",
      "http.status_code": 400,
      "anthropic.request_id": "req_test_123",
      error: true,
    });
    expect(observability.events[0].name).toBe(
      "provider.anthropic.request.error",
    );
    expect(JSON.stringify(observability.events)).not.toContain(
      "private prompt text",
    );
  });
});
