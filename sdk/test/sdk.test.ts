import { describe, expect, it } from "bun:test";
import { orderContextExtensions, toChatMessages, workflowEvent, WORKFLOW_EVENTS } from "../src/index";

describe("toChatMessages", () => {
  it("converts tool_calls to chat completions format", () => {
    const out = toChatMessages([
      { role: "assistant", content: "", tool_calls: [{ id: "t1", name: "bash", arguments: '{"command":"ls"}' }] },
      { role: "tool", tool_call_id: "t1", content: "ok" },
      { role: "user", content: "hi" },
    ]);
    expect(out[0].tool_calls).toEqual([{ id: "t1", type: "function", function: { name: "bash", arguments: '{"command":"ls"}' } }]);
    expect(out[1].tool_call_id).toBe("t1");
    expect(out[2]).toEqual({ role: "user", content: "hi" });
  });
});

describe("context extensions", () => {
  it("orders by phase, priority, and id", () => {
    const extensions = orderContextExtensions([
      { id: "z", phase: "assemble", priority: 2, contribute: async () => undefined },
      { id: "a", phase: "assemble", priority: 1, contribute: async () => undefined },
      { id: "b", phase: "assemble", priority: 1, contribute: async () => undefined },
      { id: "first", phase: "before", contribute: async () => undefined },
    ]);
    expect(extensions.map((extension) => extension.id)).toEqual(["a", "b", "z", "first"]);
  });
});

describe("workflow events", () => {
  it("creates versioned payloads with stable identifiers", () => {
    const event = workflowEvent({ query: "hello" }, { sessionId: "s1", projectId: "p1" });
    expect(WORKFLOW_EVENTS).toContain("turn.completed");
    expect(event).toEqual({ version: 1, sessionId: "s1", projectId: "p1", data: { query: "hello" } });
  });
});
