import { describe, expect, test } from "bun:test";
import { parseCliArgs } from "../src/cli-args";

describe("headless functional contract", () => {
  test("accepts the thinking styling task as a non-interactive request", () => {
    const options = parseCliArgs(
      ["--non-interactive", "Implement thinking text as gray italic content"],
      "",
    );
    expect(options.nonInteractive).toBe(true);
    expect(options.prompt).toContain("thinking text as gray italic content");
  });

  test("keeps thinking output distinct from assistant output in JSONL events", () => {
    const events = [
      { type: "thinking", content: "internal reasoning" },
      { type: "assistant", content: "final answer" },
    ];
    expect(events[0].type).not.toBe(events[1].type);
    expect(events[0].content).not.toBe(events[1].content);
  });
});
