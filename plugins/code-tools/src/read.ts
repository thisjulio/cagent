import fs from "node:fs";
import { defineTool, type PluginContext, type ToolArgs } from "@cagent/sdk";
import { errorText } from "./errors";
import { guardPath } from "./guards";
import { recordRead, wasReverted } from "./state";

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 2000;

export function readTool(ctx: PluginContext) {
  return defineTool(
    "read_file",
    "Reads a file with a line offset and limit (1-based). Records the file hash to detect stale and reverted files.",
    {
      type: "object",
      properties: {
        path: { type: "string", description: "File path (relative to the workspace or absolute)" },
        offset: { type: "number", description: "Starting line (1-based, default 1)" },
        limit: { type: "number", description: `Lines to read (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT})` },
      },
      required: ["path"],
    },
    async (args: ToolArgs) => {
      const input = String(args.path ?? "");
      let abs: string;
      try {
        abs = guardPath(input);
      } catch (e) {
        return { output: errorText("E_PATH", `${input}: ${e instanceof Error ? e.message : String(e)}`), isError: true };
      }
      let text: string;
      try {
        text = fs.readFileSync(abs, "utf8");
      } catch {
        return { output: errorText("E_NOT_FOUND", input), isError: true };
      }
      if (wasReverted(abs)) ctx.emit("code-tools/reverted", { path: abs });
      recordRead(abs);
      const eol = text.includes("\r\n") ? "\r\n" : "\n";
      const body = text.startsWith("\uFEFF") ? text.slice(1) : text;
      const lines = body.split(eol);
      const offset = Math.max(1, Math.trunc(Number(args.offset ?? 1)));
      const limit = Math.min(MAX_LIMIT, Math.max(1, Math.trunc(Number(args.limit ?? DEFAULT_LIMIT))));
      const slice = lines.slice(offset - 1, offset - 1 + limit);
      const out = slice.map((l, i) => `${offset + i}\t${l}`).join("\n");
      return { output: out || `empty file (${lines.length} line(s))` };
    },
  );
}
