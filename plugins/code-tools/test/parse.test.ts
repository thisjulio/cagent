import { describe, expect, it } from "bun:test";
import { applyHunks, applyRegions } from "../src/apply-edit";
import { parseSearchReplace } from "../src/parse-search-replace";
import { parseApplyPatch } from "../src/parse-apply-patch";

describe("parsers de edição", () => {
  it("SEARCH/REPLACE: par completo e par sem replace", () => {
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

  it("SEARCH/REPLACE: sem blocos lança erro", () => {
    expect(() => parseSearchReplace("nada")).toThrow();
  });

  it("patch: arquivo com hunk de contexto", () => {
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

  it("patch: sem blocos lança erro", () => {
    expect(() => parseApplyPatch("x")).toThrow();
  });

  it("applyRegions: replace e delete", () => {
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

  it("applyHunks: hunk sem contexto substitui o arquivo", () => {
    const out = applyHunks(["a", "b"], { path: "x", op: "update", hunks: [{ oldLines: [], newLines: ["z"] }] }, 0.85);
    expect(out.error).toBeUndefined();
    expect(out.lines).toEqual(["z"]);
  });

  it("patch: formato Codex real (Begin Patch maiúsculo + Update File:)", () => {
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

  it("patch: Add File (op add, conteúdo vira newLines)", () => {
    const p = parseApplyPatch(`*** Begin Patch\n*** Add File: src/novo.ts\n+um\n+dois\n*** End Patch`);
    expect(p).toEqual([{ path: "src/novo.ts", op: "add", hunks: [{ oldLines: [], newLines: ["um", "dois"] }] }]);
  });

  it("patch: Delete File (op delete, sem hunks)", () => {
    const p = parseApplyPatch(`*** Begin Patch\n*** Delete File: src/velho.ts\n*** End Patch`);
    expect(p).toEqual([{ path: "src/velho.ts", op: "delete", hunks: [] }]);
  });
});
