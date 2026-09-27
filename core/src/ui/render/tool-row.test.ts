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

  test("keeps paths separate from the compact title row", () => {
    for (const width of [56, 76, 116]) {
      const row = layoutToolRow(parts, width);
      expect(
        row.left.length + (row.right ? row.right.length + 2 : 0),
      ).toBeLessThanOrEqual(width);
    }
    const row = layoutToolRow(parts, 56);
    expect(row.right).not.toContain("plugins/");
    expect(row.path).toBe("plugins/anthropic/src/attribution.ts");
  });

  test("preserves the nearest path segments when the path is too long", () => {
    expect(
      layoutToolRow(
        { status: "✓", title: "Read file.ts", path: "a/long/tree/src/file.ts" },
        20,
      ).path,
    ).toBe("…/src/file.ts");
  });

  test("drops duration before truncating a long title", () => {
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
    expect(row.path).toBe("a/long/path/file.ts");
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
    expect(row.path).toBe("src/orders/total.ts");
    expect(row.right).toBe("");
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
