import { describe, expect, test } from "bun:test";

describe("human CLI streaming contract", () => {
  test("emits content in arrival order instead of waiting for final history", () => {
    const writes: string[] = [];
    const onReasoning = (text: string) => writes.push(`thinking:${text}`);
    const onText = (text: string) => writes.push(`answer:${text}`);
    onReasoning("first");
    onText("second");
    onText("third");
    expect(writes).toEqual(["thinking:first", "answer:second", "answer:third"]);
  });
});
