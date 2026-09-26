import { describe, expect, test } from "bun:test";
import { diffViewForWidth } from "./diff-view";

describe("diffViewForWidth", () => {
  test("uses unified below 140 columns and split at 140 columns", () => {
    expect(diffViewForWidth(139)).toBe("unified");
    expect(diffViewForWidth(140)).toBe("split");
  });
});
