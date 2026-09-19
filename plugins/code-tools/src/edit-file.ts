import { defineTool, type PluginContext, type ToolArgs } from "@cagent/sdk";
import { applyTargets, type Target } from "./edit-apply";
import { errorText } from "./errors";
import { parseSearchReplace } from "./parse-search-replace";
import { parseApplyPatch } from "./parse-apply-patch";
import type { Region } from "./parse-search-replace";

function num(v: unknown, d: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : d;
}

async function runEdit(
  args: ToolArgs,
  ctx: PluginContext,
  blocks: number,
  patch: number,
): Promise<{ output: string; isError: boolean }> {
  const argBlocks = typeof args.blocks === "string" ? args.blocks : undefined;
  const argPatch = typeof args.patch === "string" ? args.patch : undefined;
  if (!argBlocks && !argPatch)
    return {
      output: errorText("E_PARSE", "provide 'blocks' or 'patch'"),
      isError: true,
    };
  const seed = argBlocks ?? argPatch!;
  const inputPath = typeof args.path === "string" ? args.path : undefined;

  let regions: Region[] | undefined;
  let patchFiles;
  try {
    if (argBlocks) regions = parseSearchReplace(argBlocks);
    if (argPatch) patchFiles = parseApplyPatch(argPatch);
  } catch (e) {
    return {
      output: errorText(
        "E_PARSE",
        `${inputPath ?? "patch"}: ${e instanceof Error ? e.message : String(e)}`,
      ),
      isError: true,
    };
  }

  const targets: Target[] = regions
    ? [{ path: inputPath ?? ".", regions }]
    : (patchFiles ?? []).map((f) => ({ path: f.path, file: f }));

  return applyTargets(targets, { seed, blocks, patch }, ctx, "edit");
}

export function editFileTool(ctx: PluginContext) {
  const thresholdBlocks = num(ctx.config.threshold_search_replace, 0.75);
  const thresholdPatch = num(ctx.config.threshold_apply_patch, 0.85);

  return defineTool(
    "edit_file",
    "Edits/creates/deletes files with << SEARCH >> / << REPLACE >> blocks (blocks arg) or a *** Begin patch patch (patch arg, with *** Update/Add/Delete File: and @@ hunks). Repeated failures: the second asks for read_file and the third is fatal.",
    {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "File path (for blocks; the patch contains its own path)",
        },
        blocks: {
          type: "string",
          description: "<< SEARCH >> / << REPLACE >> blocks",
        },
        patch: {
          type: "string",
          description:
            "Complete patch in the *** Begin patch / *** End patch format",
        },
      },
    },
    (args: ToolArgs) => runEdit(args, ctx, thresholdBlocks, thresholdPatch),
  );
}
