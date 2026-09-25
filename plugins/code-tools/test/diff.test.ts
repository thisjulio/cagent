import { describe, expect, it } from "bun:test";
import { unifiedDiff } from "../src/diff";
import { unifiedPatch } from "../src/display";

function expectValidHunkCounts(patch: string): void {
  const lines = patch.split("\n");
  for (let index = 0; index < lines.length; index++) {
    const header = lines[index].match(
      /^@@ -\d+,(?<old>\d+) \+\d+,(?<next>\d+) @@$/,
    );
    if (!header?.groups) continue;
    let oldCount = 0;
    let newCount = 0;
    let oldLines = 0;
    let newLines = 0;
    for (
      index++;
      index < lines.length && !lines[index].startsWith("@@");
      index++
    ) {
      if (lines[index].startsWith(" ")) {
        oldCount++;
        newCount++;
        oldLines++;
        newLines++;
      } else if (lines[index].startsWith("-")) oldCount++;
      else if (lines[index].startsWith("+")) newCount++;
      if (lines[index].startsWith("-")) oldLines++;
      if (lines[index].startsWith("+")) newLines++;
    }
    expect(oldCount).toBe(Number(header.groups.old));
    expect(newCount).toBe(Number(header.groups.next));
    expect(oldLines).toBe(Number(header.groups.old));
    expect(newLines).toBe(Number(header.groups.next));
  }
}

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

  it("creates valid hunk counts for a small change in a large file", () => {
    const before = Array.from(
      { length: 82 },
      (_, index) => `line ${index + 1}`,
    );
    const after = [...before];
    after[40] = "changed";

    const patch = unifiedPatch(before, after, "large.ts");

    expect(patch).toContain("@@ -38,7 +38,7 @@");
    expectValidHunkCounts(patch);
  });

  it("creates separate valid hunks for distant changes", () => {
    const before = Array.from(
      { length: 30 },
      (_, index) => `line ${index + 1}`,
    );
    const after = [...before];
    after[2] = "first change";
    after[27] = "second change";

    const patch = unifiedPatch(before, after, "distant.ts");

    expect(patch.match(/^@@/gm)).toHaveLength(2);
    expectValidHunkCounts(patch);
  });

  it("creates a valid hunk for adding to an empty file", () => {
    const patch = unifiedPatch([], ["first", "second"], "new.ts");

    expect(patch).toContain("@@ -0,0 +1,2 @@");
    expectValidHunkCounts(patch);
  });
});
