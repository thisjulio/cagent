import { describe, expect, it } from "bun:test";
import type { Message } from "@cagent/sdk";
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
      180,
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
      30,
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
      30,
      5,
    );

    expect(String(result.at(-1)?.content)).toContain(
      "[older tool output pruned]",
    );
  });

  it("bounds one oversized active turn and keeps complete recent tool calls", () => {
    const messages: Message[] = [{ role: "user", content: "continue" }];
    for (let index = 0; index < 60; index++) {
      const id = `call-${index}`;
      messages.push(
        {
          role: "assistant",
          content: "",
          tool_calls: [{ id, name: "read", arguments: "{}" }],
        },
        { role: "tool", tool_call_id: id, content: `result-${index}` },
      );
    }

    const result = recentContext(messages, 40, 2_000);
    const calls = result.flatMap((message) =>
      message.role === "assistant"
        ? (message.tool_calls ?? []).map((call) => call.id)
        : [],
    );
    const outputs = result
      .filter((message) => message.role === "tool")
      .map((message) => message.tool_call_id);
    const chars = result.reduce((total, message) => {
      const content =
        typeof message.content === "string" ? message.content.length : 0;
      const toolCalls = message.tool_calls
        ? JSON.stringify(message.tool_calls).length
        : 0;
      return total + content + toolCalls;
    }, 0);

    expect(result[0]?.content).toBe("continue");
    expect(Math.ceil(chars / 4)).toBeLessThanOrEqual(40);
    expect(calls).toEqual(outputs);
    expect(calls).toContain("call-59");
    expect(calls).not.toContain("call-0");
  });
});
