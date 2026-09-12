import { describe, expect, it } from "bun:test";
import { unifiedDiff } from "../src/diff";

describe("unified diff", () => {
  it("addition only", () => {
    expect(unifiedDiff(["a", "b"], ["a", "x", "b"])).toBe(" a\n+x\n b");
  });

  it("removal only", () => {
    expect(unifiedDiff(["a", "b", "c"], ["a", "c"])).toBe(" a\n-b\n c");
  });

  it("replacement", () => {
    expect(unifiedDiff(["a", "b"], ["a", "c"])).toBe(" a\n-b\n+c");
  });

  it("empty files", () => {
    expect(unifiedDiff([], ["x"])).toBe("+x");
    expect(unifiedDiff(["x"], [])).toBe("-x");
  });
});
