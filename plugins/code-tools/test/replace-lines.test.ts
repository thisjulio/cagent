import { describe, expect, it } from "bun:test";
import { applyRanges } from "../src/apply-lines";

describe("applyRanges", () => {
  it("replaces only when old_content matches the selected lines", () => {
    const result = applyRanges(
      ["first", "second", "third"],
      [
        {
          start: 2,
          end: 2,
          expected: "second",
          content: "updated",
        },
      ],
    );

    expect(result.error).toBeUndefined();
    expect(result.lines).toEqual(["first", "updated", "third"]);
  });

  it("rejects a wrong line selection before changing anything", () => {
    const lines = ["first", "second", "third"];
    const result = applyRanges(lines, [
      {
        start: 2,
        end: 2,
        expected: "third",
        content: "updated",
      },
    ]);

    expect(result.error?.code).toBe("E_EXPECTED");
    expect(result.lines).toBe(lines);
  });

  it("validates every range before applying any range", () => {
    const lines = ["one", "two", "three", "four"];
    const result = applyRanges(lines, [
      { start: 1, end: 1, expected: "one", content: "ONE" },
      { start: 3, end: 3, expected: "wrong", content: "THREE" },
    ]);

    expect(result.error?.code).toBe("E_EXPECTED");
    expect(result.lines).toBe(lines);
  });
});
