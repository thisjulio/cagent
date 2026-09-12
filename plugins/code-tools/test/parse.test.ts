import { describe, expect, it } from "bun:test";
import { applyHunks, applyRegions } from "../src/apply-edit";
import { parseSearchReplace } from "../src/parse-search-replace";
import { parseApplyPatch } from "../src/parse-apply-patch";

describe("editing parsers", () => {
  it("SEARCH/REPLACE: complete pair and pair without replace", () => {
    const r = parseSearchReplace(
      `<<< SEARCH\nold\n>>>
<<< REPLACE
new
>>>
<<< SEARCH
drop
>>>`,
    );
    expect(r).toEqual([
      { search: "old", replace: "new" },
      { search: "drop", replace: null },
    ]);
  });

  it("SEARCH/REPLACE: no blocks throws", () => {
    expect(() => parseSearchReplace("nada")).toThrow();
  });

  it("patch: file with a context hunk", () => {
    const p = parseApplyPatch(
      `*** Begin patch
a.ts
@@ -1,3 +1,2 @@
 a
-b
 c
*** End patch`,
    );
    expect(p).toEqual([{ path: "a.ts", op: "update", hunks: [{ oldLines: ["a", "b", "c"], newLines: ["a", "c"] }] }]);
  });

  it("patch: no blocks throws", () => {
    expect(() => parseApplyPatch("x")).toThrow();
  });

  it("applyRegions: replace and delete", () => {
    const regions = parseSearchReplace(
      `<<< SEARCH\nbeta\n>>>
<<< REPLACE
B
>>>
<<< SEARCH
gamma
>>>`,
    );
    const out = applyRegions(["alpha", "beta", "gamma", "delta"], regions, 0.75);
    expect(out.error).toBeUndefined();
    expect(out.lines).toEqual(["alpha", "B", "delta"]);
  });

  it("applyHunks: context-free hunk replaces the file", () => {
    const out = applyHunks(["a", "b"], { path: "x", op: "update", hunks: [{ oldLines: [], newLines: ["z"] }] }, 0.85);
    expect(out.error).toBeUndefined();
    expect(out.lines).toEqual(["z"]);
  });

  it("patch: real Codex format (uppercase Begin Patch + Update File:)", () => {
    const p = parseApplyPatch(
      `*** Begin Patch
*** Update File: src/a.ts
@@ -1,3 +1,2 @@
 a
-b
 c
*** End Patch`,
    );
    expect(p).toEqual([{ path: "src/a.ts", op: "update", hunks: [{ oldLines: ["a", "b", "c"], newLines: ["a", "c"] }] }]);
  });

  it("patch: Add File (add operation, content becomes newLines)", () => {
    const p = parseApplyPatch(`*** Begin Patch\n*** Add File: src/new.ts\n+one\n+two\n*** End Patch`);
    expect(p).toEqual([{ path: "src/new.ts", op: "add", hunks: [{ oldLines: [], newLines: ["one", "two"] }] }]);
  });

  it("patch: Delete File (delete operation, no hunks)", () => {
    const p = parseApplyPatch(`*** Begin Patch\n*** Delete File: src/velho.ts\n*** End Patch`);
    expect(p).toEqual([{ path: "src/velho.ts", op: "delete", hunks: [] }]);
  });
});
