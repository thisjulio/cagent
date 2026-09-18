import { describe, expect, it } from "bun:test";
import { findBlock, levenshtein, normalize } from "../src/ladder";

describe("matching ladder", () => {
  const lines = ["a = 1", "b = 2", "  c = 3  ", "d = 4"];

  it("exact: match byte a byte", () => {
    const m = findBlock(lines, "a = 1\nb = 2", 0.75);
    expect(m).not.toBe("ambiguous");
    expect(m && m.mode).toBe("exact");
    expect(m && m.start).toBe(0);
  });

  it("normalized: matches normalized whitespace", () => {
    const m = findBlock(lines, "c = 3", 0.75);
    expect(m).not.toBe("ambiguous");
    expect(m && m.mode).toBe("normalized");
    expect(m && m.start).toBe(2);
  });

  it("fuzzy: matches above the threshold", () => {
    const m = findBlock(
      ["a = 1", "b = 2", "c = 3", "d = 4"],
      "a = 1\nb = 99\nc = 3",
      0.5,
    );
    expect(m).not.toBe("ambiguous");
    expect(m && m.mode).toBe("fuzzy");
    expect(m && m.start).toBe(0);
  });

  it("fuzzy: does not match below the threshold", () => {
    const m = findBlock(
      ["a = 1", "b = 2", "c = 3", "d = 4"],
      "x = 0\ny = 0",
      0.9,
    );
    expect(m).toBeNull();
  });

  it("ambiguity: tied fuzzy windows", () => {
    const m = findBlock(["a1", "b1", "a2", "b2"], "a1\nb2", 0.4);
    expect(m).toBe("ambiguous");
  });

  it("basic Levenshtein", () => {
    expect(levenshtein("abc", "abc")).toBe(0);
    expect(levenshtein("abc", "ab")).toBe(1);
    expect(levenshtein("", "xyz")).toBe(3);
  });

  it("normalize collapses whitespace", () => {
    expect(normalize("  a\t b  ")).toBe("a b");
  });
});
