import { describe, expect, it } from "bun:test";
import { toChatMessages } from "../src/index";

describe("toChatMessages", () => {
  it("converte tool_calls para o formato chat completions", () => {
    const out = toChatMessages([
      { role: "assistant", content: "", tool_calls: [{ id: "t1", name: "bash", arguments: '{"command":"ls"}' }] },
      { role: "tool", tool_call_id: "t1", content: "ok" },
      { role: "user", content: "oi" },
    ]);
    expect(out[0].tool_calls).toEqual([{ id: "t1", type: "function", function: { name: "bash", arguments: '{"command":"ls"}' } }]);
    expect(out[1].tool_call_id).toBe("t1");
    expect(out[2]).toEqual({ role: "user", content: "oi" });
  });
});
