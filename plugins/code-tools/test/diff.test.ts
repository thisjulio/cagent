import { describe, expect, it } from "bun:test";
import { unifiedDiff } from "../src/diff";

describe("diff unificado", () => {
  it("apenas adição", () => {
    expect(unifiedDiff(["a", "b"], ["a", "x", "b"])).toBe(" a\n+x\n b");
  });

  it("apenas remoção", () => {
    expect(unifiedDiff(["a", "b", "c"], ["a", "c"])).toBe(" a\n-b\n c");
  });

  it("substituição", () => {
    expect(unifiedDiff(["a", "b"], ["a", "c"])).toBe(" a\n-b\n+c");
  });

  it("arquivos vazios", () => {
    expect(unifiedDiff([], ["x"])).toBe("+x");
    expect(unifiedDiff(["x"], [])).toBe("-x");
  });
});
