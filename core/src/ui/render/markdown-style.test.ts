import { describe, expect, it } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { MarkdownRenderable, SyntaxStyle, TextAttributes } from "@opentui/core";
import { markdownSyntaxStyle } from "./markdown-style";
import { themes } from "../theme/themes";

describe("markdownSyntaxStyle", () => {
  it("registers emphasis captures", () => {
    const style = markdownSyntaxStyle(themes.dark.color);
    expect(style.getStyle("markup.strong")?.bold).toBe(true);
    expect(style.getStyle("markup.italic")?.italic).toBe(true);
    expect(style.getStyle("markup.heading")?.bold).toBe(true);
    expect(style.getStyle("markup.raw")?.fg).toBeDefined();
  });

  it("differentiates heading levels", () => {
    const style = markdownSyntaxStyle(themes.dark.color);
    const h1 = style.getStyle("markup.heading.1");
    const h2 = style.getStyle("markup.heading.2");
    const h3 = style.getStyle("markup.heading.3");
    expect(h1?.underline).toBe(true);
    expect(h2?.underline).not.toBe(true);
    expect(h1).not.toEqual(h2);
    expect(h2).not.toEqual(h3);
  });

  it("returns the same instance for equal colors", () => {
    expect(markdownSyntaxStyle(themes.dark.color)).toBe(
      markdownSyntaxStyle(themes.dark.color),
    );
  });

  it("renders bold spans for **text**", async () => {
    const setup = await createTestRenderer({ width: 40, height: 6 });
    try {
      // ponytail: mirror the production lifecycle (stream, then finalize);
      // a single streaming:false pass never paints in the test harness.
      const md = new MarkdownRenderable(setup.renderer, {
        content: "",
        syntaxStyle: markdownSyntaxStyle(themes.dark.color),
        streaming: true,
      });
      setup.renderer.root.add(md);
      md.content = "Hello **bold** world";
      await setup.renderOnce();
      md.streaming = false;
      await setup.renderOnce();
      const frame = setup.captureSpans();
      const boldText = frame.lines
        .flatMap((line) => line.spans)
        .filter((span) => (span.attributes & TextAttributes.BOLD) !== 0)
        .map((span) => span.text)
        .join("");
      expect(boldText).toContain("bold");
    } finally {
      setup.renderer.destroy();
    }
  });

  it("documents the old bug: empty SyntaxStyle has no emphasis", () => {
    const empty = SyntaxStyle.create();
    expect(empty.getStyle("markup.strong")).toBeUndefined();
  });
});
