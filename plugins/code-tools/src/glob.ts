import fg from "fast-glob";
import { defineTool, type PluginContext, type ToolArgs } from "@cagent/sdk";
import { errorText } from "./errors";
import { gitignorePatterns } from "./gitignore";
import { root } from "./state";

const MAX_FILES = 500;

export function globTool(ctx: PluginContext) {
  return defineTool(
    "list_files",
    "Lists workspace files by glob (respects .gitignore).",
    {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Glob (default: **/*)" },
        max_files: {
          type: "number",
          description: `Max files (default ${MAX_FILES})`,
        },
      },
    },
    async (args: ToolArgs) => {
      const pattern = String(args.pattern ?? "**/*");
      const max = Math.min(
        MAX_FILES,
        Math.max(1, Math.trunc(Number(args.max_files ?? MAX_FILES))),
      );
      const ROOT = root();
      try {
        const files = fg
          .sync(pattern, {
            cwd: ROOT,
            ignore: gitignorePatterns(ROOT),
            onlyFiles: true,
          })
          .slice(0, max);
        return { output: files.length ? files.join("\n") : "no results" };
      } catch (e) {
        return {
          output: errorText(
            "E_PARSE",
            `${pattern}: ${e instanceof Error ? e.message : String(e)}`,
          ),
          isError: true,
        };
      }
    },
  );
}
