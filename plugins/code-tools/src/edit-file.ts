import fs from "node:fs";
import path from "node:path";
import { defineTool, type PluginContext, type ToolArgs } from "@cagent/sdk";
import { applyHunks, applyRegions } from "./apply-edit";
import { atomicWrite } from "./atomic-write";
import { unifiedDiff } from "./diff";
import { runFormat, tscErrors } from "./diagnostics";
import { errorText } from "./errors";
import { guardPath } from "./guards";
import { ensureShadow, shadowCommit } from "./git-shadow";
import { parseSearchReplace } from "./parse-search-replace";
import type { PatchFile } from "./parse-apply-patch";
import { parseApplyPatch } from "./parse-apply-patch";
import { applyRanges, type LineRange } from "./apply-lines";
import { bumpFailure, clearFailures, fileHash, getRead, hasLineAnchor, recordRead, recordWrite, root } from "./state";
import type { Region } from "./parse-search-replace";

function num(v: unknown, d: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : d;
}

function rel(abs: string): string {
  return path.relative(root(), abs);
}

interface Target {
  path: string;
  regions?: Region[];
  file?: PatchFile;
  ranges?: LineRange[];
}

async function processTarget(t: Target, o: { seed: string; blocks: number; patch: number; out: string[] }): Promise<boolean> {
  let abs: string;
  try { abs = guardPath(t.path); } catch (e) { o.out.push(errorText("E_PATH", `${t.path}: ${e instanceof Error ? e.message : String(e)}`)); return false; }
  const op = t.file?.op ?? "update";
  const moveAbs = t.file?.movePath ? guardPath(t.file.movePath) : undefined;
  if (moveAbs && fs.existsSync(moveAbs)) {
    o.out.push(errorText("E_EXISTS", `${t.file?.movePath}: move destination already exists`));
    return false;
  }
  if (op === "delete") {
    try { fs.rmSync(abs); } catch { o.out.push(errorText("E_NOT_FOUND", t.path)); return false; }
    recordWrite(abs, "");
    o.out.push(`OK ${rel(abs)} (removed)`);
    return true;
  }
  let original: string;
  let missing = false;
  try { original = fs.readFileSync(abs, "utf8"); }
  catch { missing = true; original = ""; }
  if (op === "add") {
    if (!missing) { o.out.push(errorText("E_EXISTS", `${t.path}: file already exists - use Update (blocks/patch) instead of Add`)); return false; }
  } else if (missing) {
    o.out.push(errorText("E_NOT_FOUND", t.path));
    return false;
  }
  const prev = getRead(abs);
  if (prev && prev.hash !== fileHash(abs)) {
    o.out.push(errorText("E_STALE", `${t.path}: file changed since the last read_file`));
    return false;
  }
  if (t.ranges && !hasLineAnchor(abs)) {
    o.out.push(errorText("E_STALE", `${t.path}: line numbers are not current - call read_file on ${t.path} and use the numbers it returns`));
    return false;
  }
  const body = original.startsWith("\uFEFF") ? original.slice(1) : original;
  const eol = body.includes("\r\n") ? "\r\n" : "\n";
  const oldLines = body.length ? body.split(eol) : [];
  const applied = t.ranges
    ? applyRanges(oldLines, t.ranges)
    : t.regions
      ? applyRegions(oldLines, t.regions, o.blocks)
      : applyHunks(oldLines, t.file!, o.patch);
  if (applied.error) {
    const n = bumpFailure(abs, o.seed);
    const detail = "message" in applied.error
      ? applied.error.message
      : `target ${JSON.stringify(applied.error.search.slice(0, 80))}`;
    o.out.push(errorText(
      n >= 3 ? "E_REPEATED_FAILURE" : applied.error.code,
      n >= 3 ? `${t.path}: 3 consecutive failures with the same target - read the file and reformulate the edit`
        : n === 2 ? `${t.path}: use read_file on ${t.path} to see the current content`
          : `${t.path}: ${detail}`,
    ));
    return false;
  }
  const next = (original.startsWith("\uFEFF") ? "\uFEFF" : "") + applied.lines.join(eol);
  try {
    atomicWrite(abs, next);
    if (moveAbs) {
      if (fs.existsSync(moveAbs)) throw new Error(`move destination already exists: ${t.file?.movePath}`);
      fs.mkdirSync(path.dirname(moveAbs), { recursive: true });
      fs.renameSync(abs, moveAbs);
    }
  } catch (e) {
    o.out.push(errorText("E_WRITE", `${t.path}: ${e instanceof Error ? e.message : String(e)}`));
    return false;
  }
  recordRead(moveAbs ?? abs);
  recordWrite(moveAbs ?? abs, next);
  clearFailures(abs);
  const diff = unifiedDiff(oldLines, applied.lines).split("\n");
  const label = moveAbs ? `${rel(abs)} -> ${rel(moveAbs)}` : rel(abs);
  o.out.push(`OK ${label}\n${diff.slice(0, 100).join("\n")}${diff.length > 100 ? "\n…" : ""}`);
  return true;
}

async function applyTargets(
  targets: Target[],
  o: { seed: string; blocks: number; patch: number },
  ctx: PluginContext,
  label: string,
): Promise<{ output: string; isError: boolean }> {
  const tscBefore = await tscErrors(root());
  const out: string[] = [];
  let ok = 0;
  for (const t of targets) if (await processTarget(t, { ...o, out })) ok++;

  const fmt = await runFormat(root());
  const tscAfter = await tscErrors(root());
  const newErrors = tscAfter.filter((l) => !tscBefore.includes(l));
  if (fmt) out.push(`format:\n${fmt.slice(0, 500)}`);
  if (newErrors.length) out.push(`new tsc errors:\n${newErrors.slice(0, 20).join("\n")}`);
  if (ok) {
    await ensureShadow();
    await shadowCommit(`${label} ${ok} file(s)`);
  }
  ctx.emit("code-tools/edit", { ok, failed: targets.length - ok, newErrors });
  return { output: out.join("\n"), isError: ok === 0 };
}

async function runEdit(args: ToolArgs, ctx: PluginContext, blocks: number, patch: number): Promise<{ output: string; isError: boolean }> {
  const argBlocks = typeof args.blocks === "string" ? args.blocks : undefined;
  const argPatch = typeof args.patch === "string" ? args.patch : undefined;
  if (!argBlocks && !argPatch) return { output: errorText("E_PARSE", "provide 'blocks' or 'patch'"), isError: true };
  const seed = argBlocks ?? argPatch!;
  const inputPath = typeof args.path === "string" ? args.path : undefined;

  let regions: Region[] | undefined;
  let patchFiles: PatchFile[] | undefined;
  try {
    if (argBlocks) regions = parseSearchReplace(argBlocks);
    if (argPatch) patchFiles = parseApplyPatch(argPatch);
  } catch (e) {
    return { output: errorText("E_PARSE", `${inputPath ?? "patch"}: ${e instanceof Error ? e.message : String(e)}`), isError: true };
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
        path: { type: "string", description: "File path (for blocks; the patch contains its own path)" },
        blocks: { type: "string", description: "<< SEARCH >> / << REPLACE >> blocks" },
        patch: { type: "string", description: "Complete patch in the *** Begin patch / *** End patch format" },
      },
    },
    (args: ToolArgs) => runEdit(args, ctx, thresholdBlocks, thresholdPatch),
  );
}

function int(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value.trim());
  return undefined;
}

function parseRanges(args: ToolArgs): { ranges?: LineRange[]; error?: string } {
  const raw = args.edits ?? args.ranges ?? (args.start_line !== undefined ? args : undefined);
  if (raw === undefined) return { error: 'provide "edits": [{"start_line": 1, "end_line": 1, "content": "..."}]' };

  const items = Array.isArray(raw) ? raw : [raw];
  const ranges: LineRange[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") return { error: "each entry in 'edits' must be an object with start_line, end_line and content" };
    const rec = item as Record<string, unknown>;
    const start = int(rec.start_line ?? rec.start);
    const end = int(rec.end_line ?? rec.end ?? rec.start_line ?? rec.start);
    if (start === undefined || end === undefined) return { error: "start_line and end_line must be whole numbers, as shown by read_file" };
    if (typeof rec.content !== "string") return { error: `the entry for lines ${start}-${end} has no 'content' - send "" to delete those lines` };
    ranges.push({ start, end, content: rec.content });
  }
  if (!ranges.length) return { error: "'edits' is empty" };
  return { ranges };
}

export function replaceLinesTool(ctx: PluginContext) {
  return defineTool(
    "replace_lines",
    [
      "Replaces ranges of lines in a file you have just read with read_file.",
      "The line numbers come from the read_file output. Call read_file first.",
      "Send one entry per region you are changing, all numbered from that same read_file output.",
      "content is the new text for those lines; an empty string deletes them.",
      "After this tool succeeds the line numbers are out of date: call read_file again before editing this file.",
    ].join(" "),
    {
      type: "object",
      properties: {
        path: { type: "string", description: "File path, as shown by read_file" },
        edits: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              start_line: { type: "integer", minimum: 1, description: "First line to replace. Inclusive." },
              end_line: { type: "integer", minimum: 1, description: "Last line to replace. Inclusive. Same as start_line to replace one line." },
              content: { type: "string", description: 'New text for those lines. Empty string ("") deletes them.' },
            },
            required: ["start_line", "end_line", "content"],
            additionalProperties: false,
          },
        },
      },
      required: ["path", "edits"],
      additionalProperties: false,
    },
    async (args: ToolArgs) => {
      const inputPath = typeof args.path === "string" ? args.path.trim() : "";
      if (!inputPath) return { output: errorText("E_PARSE", "provide 'path'"), isError: true };

      const parsed = parseRanges(args);
      if (parsed.error) return { output: errorText("E_PARSE", `${inputPath}: ${parsed.error}`), isError: true };

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
