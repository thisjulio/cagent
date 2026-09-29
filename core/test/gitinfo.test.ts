import { describe, expect, test } from "bun:test";
import { formatGitBadge, parseGitInfo } from "../src/gitinfo";

describe("parseGitInfo", () => {
  test("parses branch, upstream counts, and changed paths from porcelain v2", () => {
    const info = parseGitInfo(
      [
        "# branch.oid abc123",
        "# branch.head feature/status",
        "# branch.upstream origin/feature/status",
        "# branch.ab +2 -1",
        "1 .M N... 100644 100644 100644 abc123 def456 file.ts",
        "? untracked.ts",
      ].join("\n"),
    );

    expect(info).toEqual({
      branch: "feature/status",
      ahead: 2,
      behind: 1,
      dirty: 2,
      isRepo: true,
    });
    expect(formatGitBadge(info)).toBe("⎇ feature/status ↑2 ↓1 ⚠2");
  });

  test("returns empty info when status output has no branch", () => {
    expect(parseGitInfo("")).toEqual({
      branch: null,
      ahead: 0,
      behind: 0,
      dirty: 0,
      isRepo: false,
    });
  });
});
