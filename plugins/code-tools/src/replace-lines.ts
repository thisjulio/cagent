import { defineTool, type PluginContext, type ToolArgs } from "@cagent/sdk";
import { errorText } from "./errors";
import { applyTargets } from "./edit-apply";
import type { LineRange } from "./apply-lines";

function int(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim()))
    return Number(value.trim());
  return undefined;
}

function parseRanges(args: ToolArgs): { ranges?: LineRange[]; error?: string } {
  const raw =
    args.edits ??
    args.ranges ??
    (args.start_line !== undefined ? args : undefined);
  if (raw === undefined)
    return {
      error:
        'provide "edits": [{"start_line": 1, "end_line": 1, "old_content": "...", "content": "..."}]',
    };

  const items = Array.isArray(raw) ? raw : [raw];
  const ranges: LineRange[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object")
      return {
        error:
          "each entry in 'edits' must be an object with start_line, end_line, old_content and content",
      };
    const rec = item as Record<string, unknown>;
    const start = int(rec.start_line ?? rec.start);
    const end = int(rec.end_line ?? rec.end ?? rec.start_line ?? rec.start);
    if (start === undefined || end === undefined)
      return {
        error:
          "start_line and end_line must be whole numbers, as shown by read_file",
      };
    if (typeof rec.old_content !== "string")
      return {
        error: `the entry for lines ${start}-${end} has no 'old_content' - copy the current lines from read_file`,
      };
    if (typeof rec.content !== "string")
      return {
        error: `the entry for lines ${start}-${end} has no 'content' - send "" to delete those lines`,
      };
    ranges.push({
      start,
      end,
      expected: rec.old_content,
      content: rec.content,
    });
  }
  if (!ranges.length) return { error: "'edits' is empty" };
  return { ranges };
}

export { parseRanges };

export function replaceLinesTool(ctx: PluginContext) {
  return defineTool(
    "replace_lines",
    [
      "Replaces ranges of lines in a file you have just read with read_file.",
      "The line numbers come from the read_file output. Call read_file first.",
      "Every edit must include old_content copied exactly from the lines being replaced; line numbers alone are not safe.",
      "Send one entry per region you are changing, all numbered from that same read_file output.",
      "content is the new text for those lines; an empty string deletes them.",
      "After this tool succeeds the line numbers are out of date: call read_file again before editing this file.",
    ].join(" "),
    {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "File path, as shown by read_file",
        },
        edits: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              start_line: {
                type: "integer",
                minimum: 1,
                description: "First line to replace. Inclusive.",
              },
              end_line: {
                type: "integer",
                minimum: 1,
                description:
                  "Last line to replace. Inclusive. Same as start_line to replace one line.",
              },
              old_content: {
                type: "string",
                description:
                  "Exact current content of the numbered lines, copied from read_file",
              },
              content: {
                type: "string",
                description:
                  'New text for those lines. Empty string ("") deletes them.',
              },
            },
            required: ["start_line", "end_line", "old_content", "content"],
            additionalProperties: false,
          },
        },
      },
      required: ["path", "edits"],
      additionalProperties: false,
    },
    async (args: ToolArgs) => {
      const inputPath = typeof args.path === "string" ? args.path.trim() : "";
      if (!inputPath)
        return {
          output: errorText("E_PARSE", "provide 'path'"),
          isError: true,
        };

      const parsed = parseRanges(args);
      if (parsed.error)
        return {
          output: errorText("E_PARSE", `${inputPath}: ${parsed.error}`),
          isError: true,
        };

      const ranges = parsed.ranges!;
      return applyTargets(
        [{ path: inputPath, ranges }],
        { seed: JSON.stringify(ranges), blocks: 0, patch: 0 },
        ctx,
        "replace-lines",
      );
    },
  );
}
