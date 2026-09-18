import { describe, expect, it } from "bun:test";
import { recentContext } from "../src/context/recent-context";

describe("recent context budget", () => {
  it("keeps complete recent turns within the token budget", () => {
    const result = recentContext(
      [
        { role: "user", content: "old ".repeat(100) },
        { role: "assistant", content: "old answer" },
        { role: "user", content: "recent ".repeat(100) },
        { role: "assistant", content: "recent answer" },
      ],
      30,
      2000,
    );

    expect(result.map((message) => message.content)).toEqual([
      "recent ".repeat(100),
      "recent answer",
    ]);
  });

  it("keeps assistant tool calls with their tool results", () => {
    const result = recentContext(
      [
        { role: "user", content: "request" },
        {
          role: "assistant",
          content: "",
          tool_calls: [{ id: "call-1", name: "read", arguments: "{}" }],
        },
        { role: "tool", tool_call_id: "call-1", content: "file contents" },
      ],
      10,
      2000,
    );

    expect(result.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "tool",
    ]);
  });

  it("prunes oversized tool output before applying the budget", () => {
    const result = recentContext(
      [
        { role: "user", content: "request" },
        {
          role: "assistant",
          content: "",
          tool_calls: [{ id: "call-1", name: "read", arguments: "{}" }],
        },
        { role: "tool", tool_call_id: "call-1", content: "x".repeat(1000) },
      ],
      20,
      5,
    );

    expect(String(result.at(-1)?.content)).toContain(
      "[older tool output pruned]",
    );
  });
});
