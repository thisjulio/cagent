import { describe, expect, it } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { MarkdownRenderable, SyntaxStyle } from "@opentui/core";
import { settleStreamingMarkdown } from "./streaming-markdown";

describe("settleStreamingMarkdown", () => {
  it("closes an unclosed bold in the tail", () => {
    expect(settleStreamingMarkdown("Hello **wor")).toBe("Hello **wor**");
  });

  it("closes an unclosed code span in the tail", () => {
    expect(settleStreamingMarkdown("a `co")).toBe("a `co`");
  });

  it("closes nested delimiters innermost-first", () => {
    expect(settleStreamingMarkdown("**bold `code")).toBe("**bold `code`**");
  });

  it("returns balanced content untouched by reference", () => {
    const content = "Hello **world** and `code` done";
    expect(settleStreamingMarkdown(content)).toBe(content);
  });

  it("leaves literal markers in sealed paragraphs alone", () => {
    const content = "2 ** 3 = 8\n\nnext line";
    expect(settleStreamingMarkdown(content)).toBe(content);
  });

  it("closes an open fence and nothing else", () => {
    expect(settleStreamingMarkdown("text\n```ts\nconst x = 1")).toBe(
      "text\n```ts\nconst x = 1\n```",
    );
  });

  it("leaves a closed fence untouched", () => {
    const content = "text\n```ts\nconst x = 1\n```\n";
    expect(settleStreamingMarkdown(content)).toBe(content);
  });

  it("closes constructs opened after the last blank line", () => {
    expect(settleStreamingMarkdown("sealed **para**\n\nnew **ta")).toBe(
      "sealed **para**\n\nnew **ta**",
    );
  });

  it("keeps empty content empty", () => {
    expect(settleStreamingMarkdown("")).toBe("");
  });
});

describe("settled streaming frames", () => {
  it("never flashes raw markers mid-stream", async () => {
    const setup = await createTestRenderer({ width: 60, height: 20 });
    try {
      const md = new MarkdownRenderable(setup.renderer, {
        content: "",
        syntaxStyle: SyntaxStyle.create(),
        streaming: true,
      });
      setup.renderer.root.add(md);
      const chunks = [
        "Hello **wor",
        "ld** and `co",
        "de` done\n\n- it",
        "em 1\n- item 2\n\n```ts\nconst x",
        " = 1\n```\n",
      ];
      let acc = "";
      for (const chunk of chunks) {
        acc += chunk;
        md.content = settleStreamingMarkdown(acc);
        await setup.renderOnce();
        const frame = setup.captureCharFrame();
        expect(frame).not.toContain("**");
        expect(frame).not.toContain("`");
      }
      md.streaming = false;
      md.content = acc;
      await setup.renderOnce();
      const final = setup.captureCharFrame();
      expect(final).toContain("Hello world and code done");
      expect(final).toContain("const x = 1");
    } finally {
      setup.renderer.destroy();
    }
  });
});
