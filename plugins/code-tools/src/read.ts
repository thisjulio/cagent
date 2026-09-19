import fs from "node:fs";
import readline from "node:readline";
import { defineTool, type PluginContext, type ToolArgs } from "@cagent/sdk";
import { errorText } from "./errors";
import { guardPath } from "./guards";
import { recordRead, wasReverted } from "./state";
import { filetypeForPath } from "./display";

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 2000;

async function readLines(
  file: string,
  offset: number,
  limit: number,
): Promise<{ lines: string[]; totalLines: number | undefined }> {
  const input = fs.createReadStream(file, { encoding: "utf8" });
  const reader = readline.createInterface({ input, crlfDelay: Infinity });
  const lines: string[] = [];
  let totalLines = 0;
  let hasMore = false;
  try {
    for await (const value of reader) {
      totalLines++;
      if (totalLines >= offset && lines.length < limit) {
        const line = totalLines === 1 ? value.replace(/^\uFEFF/, "") : value;
        lines.push(line);
      } else if (lines.length >= limit) {
        hasMore = true;
        break;
      }
    }
  } finally {
    reader.close();
    input.destroy();
  }
  return { lines, totalLines: hasMore ? undefined : totalLines };
}

export function readTool(ctx: PluginContext) {
  return defineTool(
    "read_file",
    `Reads a bounded file segment with a line offset and limit (1-based, default ${DEFAULT_LIMIT}, max ${MAX_LIMIT}). Returns pagination metadata. Records the file hash to detect stale and reverted files.`,
    {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "File path (relative to the workspace or absolute)",
        },
        offset: {
          type: "number",
          description: "Starting line (1-based, default 1)",
        },
        limit: {
          type: "number",
          description: `Lines to read (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT})`,
        },
      },
      required: ["path"],
    },
    async (args: ToolArgs) => {
      const input = String(args.path ?? "");
      let abs: string;
      try {
        abs = guardPath(input);
      } catch (e) {
        return {
          output: errorText(
            "E_PATH",
            `${input}: ${e instanceof Error ? e.message : String(e)}`,
          ),
          isError: true,
        };
      }
      const offset = Math.max(1, Math.trunc(Number(args.offset ?? 1)));
      const limit = Math.min(
        MAX_LIMIT,
        Math.max(1, Math.trunc(Number(args.limit ?? DEFAULT_LIMIT))),
      );
      let segment: {
        lines: string[];
        totalLines: number | undefined;
      };
      try {
        segment = await readLines(abs, offset, limit);
      } catch {
        return { output: errorText("E_NOT_FOUND", input), isError: true };
      }
      if (wasReverted(abs)) ctx.emit("code-tools/reverted", { path: abs });
      recordRead(abs);
      const endLine = offset + segment.lines.length - 1;
      const hasMore = segment.totalLines === undefined;
      const nextOffset = hasMore ? endLine + 1 : null;
      const body = segment.lines
        .map((line, index) => `${offset + index}\t${line}`)
        .join("\n");
      const metadata = [
        `startLine=${offset}`,
        `endLine=${endLine}`,
        `totalLines=${segment.totalLines ?? "unknown"}`,
        `hasMore=${hasMore}`,
        `nextOffset=${nextOffset ?? "none"}`,
      ].join(" | ");
      return {
        output: body ? `${metadata}\n${body}` : `${metadata}\n(empty range)`,
        evidence: [{ path: abs, line: offset, kind: "code" }],
        display: body
          ? {
              kind: "code",
              content: segment.lines.join("\n"),
              filetype: filetypeForPath(abs),
              path: abs,
              lineStart: offset,
              lineNumbers: true,
            }
          : undefined,
      };
    },
  );
}
