import { defineTool, type PluginContext, type ToolArgs } from "@cagent/sdk";
import { atomicWrite } from "./atomic-write";
import { errorText } from "./errors";
import { guardPath } from "./guards";
import { recordRead, recordWrite } from "./state";
import { diffDisplay, filetypeForPath, unifiedPatch } from "./display";
import fs from "node:fs";

export function writeFileTool(ctx: PluginContext) {
  return defineTool(
    "write_file",
    "Creates or overwrites a file with the given content (atomic write).",
    {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "File path (relative to the workspace or absolute)",
        },
        content: { type: "string", description: "Complete file content" },
      },
      required: ["path", "content"],
    },
    async (args: ToolArgs) => {
      const input = String(args.path ?? "");
      const content = String(args.content ?? "");
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
      let previous = "";
      try {
        previous = fs.readFileSync(abs, "utf8");
      } catch {
        // A missing file is represented as an all-added diff.
      }
      try {
        atomicWrite(abs, content);
      } catch (e) {
        return {
          output: errorText(
            "E_WRITE",
            `${input}: ${e instanceof Error ? e.message : String(e)}`,
          ),
          isError: true,
        };
      }
      recordRead(abs);
      recordWrite(abs, content);
      ctx.emit("code-tools/write", { path: abs });
      const oldLines = previous ? previous.split(/\r?\n/) : [];
      const newLines = content ? content.split(/\r?\n/) : [];
      const diff = unifiedPatch(oldLines, newLines, abs);
      return {
        output: `written ${abs}`,
        changesWorkspace: true,
        display: diffDisplay(diff, abs) ?? {
          kind: "code",
          content,
          filetype: filetypeForPath(abs),
          path: abs,
        },
      };
    },
  );
}
