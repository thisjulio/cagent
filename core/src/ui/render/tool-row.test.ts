import { describe, expect, test } from "bun:test";
import { layoutToolRow } from "./tool-row";

describe("layoutToolRow", () => {
  const parts = {
    status: "✓",
    icon: "✎",
    title: "Multiply price by quantity",
    path: "plugins/anthropic/src/attribution.ts",
    added: 19,
    removed: 1,
    duration: "1.4s",
  };

  test("fits target widths and shortens the path to its basename", () => {
    for (const width of [56, 76, 116]) {
      const row = layoutToolRow(parts, width);
      expect(
        row.left.length + (row.right ? row.right.length + 2 : 0),
      ).toBeLessThanOrEqual(width);
    }
    expect(layoutToolRow(parts, 56).right).not.toContain("plugins/");
  });

  test("drops duration, then path, then truncates the title in that order", () => {
    const row = layoutToolRow(
      {
        status: "✓",
        title: "A reasonably long title",
        path: "a/long/path/file.ts",
        summary: "created 3 tasks",
        duration: "2.0s",
      },
      40,
    );
    expect(row.right).not.toContain("2.0s");
    expect(row.right).not.toContain("file.ts");
    expect(row.left).toContain("…");
    expect(row.left).toContain("A reasonably");
  });

  test("keeps basename when it fits and omits zero duration", () => {
    const row = layoutToolRow(
      {
        status: "✓",
        title: "Read total.ts",
        path: "src/orders/total.ts",
        duration: "0.0s",
      },
      60,
    );
    expect(row.right).toBe("src/orders/total.ts");
  });

  test("keeps shell summary and duration grouped together", () => {
    expect(
      layoutToolRow(
        {
          status: "✓",
          title: "Run tests",
          summary: "exit 0",
          duration: "1.4s",
        },
        76,
      ).right,
    ).toBe("exit 0 · 1.4s");
  });
});
