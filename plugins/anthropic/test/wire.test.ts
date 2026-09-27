import { describe, expect, test } from "bun:test";
import { buildRequest } from "../src/wire";

describe("Anthropic request wire conversion", () => {
  test("omits empty system and user text blocks", () => {
    const request = buildRequest(
      [
        { role: "system", content: "" },
        { role: "system", content: [{ type: "text", text: "  " }] },
        { role: "user", content: "" },
        { role: "user", content: [{ type: "text", text: "" }] },
      ],
      [],
    );
    expect(request.system).toBeUndefined();
    expect(request.messages).toEqual([]);
  });

  test("preserves non-empty text and tool-use blocks", () => {
    const request = buildRequest(
      [
        { role: "system", content: "System instructions" },
        {
          role: "assistant",
          content: "",
          tool_calls: [{ id: "call-1", name: "read_file", arguments: "{}" }],
        },
      ],
      [],
    );
    expect(request.system).toEqual([
      { type: "text", text: "System instructions" },
    ]);
    expect(request.messages).toEqual([
      {
        role: "assistant",
        content: [
          { type: "tool_use", id: "call-1", name: "read_file", input: {} },
        ],
      },
    ]);
  });

  test("preserves tool result content blocks instead of stringifying them", () => {
    const request = buildRequest(
      [
        {
          role: "assistant",
          content: "",
          tool_calls: [{ id: "call-1", name: "read_file", arguments: "{}" }],
        },
        {
          role: "tool",
          tool_call_id: "call-1",
          content: [
            { type: "text", text: "first block" },
            { type: "text", text: "second block" },
          ],
        },
      ],
      [],
    );

    expect(request.messages[1]).toEqual({
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: "call-1",
          content: [
            { type: "text", text: "first block" },
            { type: "text", text: "second block" },
          ],
        },
      ],
    });
    expect(JSON.stringify(request.messages)).not.toContain("[object Object]");
  });

  test("aggregates parallel tool results in a single user message", () => {
    const request = buildRequest(
      [
        {
          role: "assistant",
          content: "",
          tool_calls: [
            { id: "call-1", name: "read_file", arguments: "{}" },
            { id: "call-2", name: "search", arguments: "{}" },
          ],
        },
        { role: "tool", tool_call_id: "call-1", content: "first result" },
        { role: "tool", tool_call_id: "call-2", content: "second result" },
      ],
      [],
    );

    expect(request.messages.map((message) => message.role)).toEqual([
      "assistant",
      "user",
    ]);
    expect(request.messages[1]?.content).toHaveLength(2);
    expect(request.messages[1]?.content.map((block) => block.type)).toEqual([
      "tool_result",
      "tool_result",
    ]);
  });

  test("keeps assistant text before tool-use blocks", () => {
    const request = buildRequest(
      [
        {
          role: "assistant",
          content: "I will run the requested check.",
          tool_calls: [{ id: "call-1", name: "bash", arguments: "{}" }],
        },
        { role: "tool", tool_call_id: "call-1", content: "check complete" },
      ],
      [],
    );

    expect(request.messages[0]?.content.map((block) => block.type)).toEqual([
      "text",
      "tool_use",
    ]);
    expect(request.messages.map((message) => message.role)).toEqual([
      "assistant",
      "user",
    ]);
  });

  test("includes all messages and keeps cache on system when prefix is overestimated", () => {
    const request = buildRequest(
      [
        { role: "system", content: "S" },
        { role: "user", content: "one" },
        { role: "assistant", content: "two" },
      ],
      [],
      5,
    );
    expect(request.system).toHaveLength(1);
    expect(request.system?.[0]?.cache_control).toEqual({
      type: "ephemeral",
    });
    expect(request.messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
    ]);
    expect(
      request.messages.flatMap((message) => message.content),
    ).not.toContainEqual(
      expect.objectContaining({ cache_control: { type: "ephemeral" } }),
    );
  });

  test("marks the final tool schema as the stable cache boundary", () => {
    const request = buildRequest(
      [{ role: "system", content: "Instructions" }],
      [
        { name: "read_file", description: "Read", parameters: {} },
        { name: "search", description: "Search", parameters: {} },
      ],
    );
    expect(request.tools?.[0]?.cache_control).toBeUndefined();
    expect(request.tools?.[1]?.cache_control).toEqual({ type: "ephemeral" });
  });

  test("marks the latest stable system message when the prefix covers it", () => {
    const request = buildRequest(
      [
        { role: "system", content: "Instructions" },
        { role: "system", content: "Stable context" },
        { role: "user", content: "Question" },
      ],
      [],
      2,
    );
    expect(request.system?.[1]).toMatchObject({
      type: "text",
      text: "Stable context",
      cache_control: { type: "ephemeral" },
    });
    expect(
      request.messages.flatMap((message) => message.content),
    ).not.toContainEqual(
      expect.objectContaining({ cache_control: { type: "ephemeral" } }),
    );
  });
});
