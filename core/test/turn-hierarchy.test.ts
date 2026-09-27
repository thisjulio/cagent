import { describe, expect, test } from "bun:test";
import { diffStats } from "../src/controller/diff-stats";
import { defaultExpanded } from "../src/controller/expansion";
import { deriveSummary } from "../src/controller/tool-summary";
import { fallbackToolTitle } from "../src/tool-title";
import { chatToBlocks } from "../src/ui/render/blocks";
import { layoutToolRow } from "../src/ui/render/tool-row";
import type { ChatItem } from "../src/controller/state";

describe("turn hierarchy controller rules", () => {
  test("counts changed lines without diff headers", () => {
    expect(diffStats("--- a/a\n+++ b/a\n-old\n+new\n+extra")).toEqual({
      added: 2,
      removed: 1,
    });
  });

  test("defaults tools and skills to the correct expansion state", () => {
    expect(
      defaultExpanded({
        kind: "tool",
        content: "",
        display: { kind: "diff", content: "" },
      }),
    ).toBe(true);
    expect(
      defaultExpanded({
        kind: "tool",
        content: "",
        isError: true,
        denied: true,
      }),
    ).toBe(false);
    expect(defaultExpanded({ kind: "tool", content: "", isError: true })).toBe(
      true,
    );
    expect(defaultExpanded({ kind: "thinking", content: "reason" })).toBe(
      false,
    );
    expect(defaultExpanded({ kind: "skill", content: "instructions" })).toBe(
      false,
    );
  });

  test("derives tool outcomes without parsing tool-specific content", () => {
    const item: ChatItem = {
      kind: "tool",
      content: "",
      display: { kind: "terminal", exitCode: 0, stdout: "" },
    };
    expect(deriveSummary(item)).toBe("exit 0");
    expect(deriveSummary({ ...item, isError: true })).toBe("failed");
    expect(deriveSummary({ ...item, denied: true, isError: true })).toBe(
      "denied",
    );
    expect(deriveSummary({ kind: "tool", content: "" })).toBeUndefined();
    expect(
      deriveSummary({
        kind: "tool",
        toolCategory: "search",
        content: "one\ntwo",
      }),
    ).toBeUndefined();
  });

  test("uses category and arguments for fallback titles", () => {
    expect(fallbackToolTitle("edit_file", "write", { path: "src/a.ts" })).toBe(
      "Edit a.ts",
    );
    expect(fallbackToolTitle("write_file", "write", { path: "src/a.ts" })).toBe(
      "Write a.ts",
    );
    expect(fallbackToolTitle("read_file", "read", { path: "src/a.ts" })).toBe(
      "Read a.ts",
    );
    expect(fallbackToolTitle("search", "search", { pattern: "total\\(" })).toBe(
      'Search "total\\("',
    );
    expect(
      fallbackToolTitle("search", "search", { pattern: "ToolItemComponent" }),
    ).toBe('Search "ToolItemComponent"');
    expect(fallbackToolTitle("bash", "shell", { command: "bun test" })).toBe(
      "Run bun",
    );
    expect(fallbackToolTitle("tasks", "agent", {})).toBe("tasks");
    expect(fallbackToolTitle("subagent", "agent", { name: "general" })).toBe(
      "Subagent @general",
    );
    expect(
      fallbackToolTitle("list_files", "search", { pattern: "*.tsx" }),
    ).toBe('List files "*.tsx"');
    expect(
      fallbackToolTitle("search_ast", "search", { pattern: "ToolItem" }),
    ).toBe('Search AST "ToolItem"');
    expect(fallbackToolTitle("edit_file", "write", {})).toBe("edit_file");
  });

  test("projects direct subagent execution status without a blank response", () => {
    const block = chatToBlocks([
      {
        kind: "assistant",
        content: "",
        subagent: "general",
        subagentHeader: true,
        running: true,
        turnId: "subagent-turn",
      },
    ])[0];
    expect(block.type).toBe("agent-turn");
    if (block.type !== "agent-turn") return;
    expect(block.subagentStatus).toBe("running");
    expect(block.items).toHaveLength(0);
  });

  test("diff expansion stops above twelve changed lines", () => {
    const makeDiff = (changed: number): ChatItem => ({
      kind: "tool",
      content: "",
      display: {
        kind: "diff",
        content: Array.from({ length: changed }, () => "+changed").join("\n"),
      },
    });
    expect(defaultExpanded(makeDiff(12))).toBe(true);
    expect(defaultExpanded(makeDiff(13))).toBe(false);
  });

  test("calculates the toggle from the effective default state", async () => {
    const { toggleToolExpand } = await import("../src/controller/chat-actions");
    const state = {
      chat: [
        {
          kind: "tool" as const,
          content: "",
          display: { kind: "diff" as const, content: "+change" },
        },
      ],
    } as Parameters<typeof toggleToolExpand>[0];
    toggleToolExpand(state, 0, () => {});
    expect(state.chat[0].expanded).toBe(false);
  });
});

describe("tool row layout", () => {
  test("keeps the row within requested widths", () => {
    const parts = {
      status: "✓",
      icon: "✎",
      title: "Multiply price by quantity",
      path: "src/orders/total.ts",
      added: 1,
      removed: 1,
      duration: "1.4s",
    };
    for (const width of [56, 76, 116]) {
      const row = layoutToolRow(parts, width);
      expect(
        row.left.length + (row.right ? row.right.length + 2 : 0),
      ).toBeLessThanOrEqual(width);
    }
  });
});
