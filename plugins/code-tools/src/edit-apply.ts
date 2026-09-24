import fs from "node:fs";
import path from "node:path";
import type { PluginContext } from "@cagent/sdk";
import { applyHunks, applyRegions } from "./apply-edit";
import { atomicWrite } from "./atomic-write";
import { unifiedDiff } from "./diff";
import { runFormat, tscErrors } from "./diagnostics";
import { errorText } from "./errors";
import { guardPath } from "./guards";
import { ensureShadow, shadowCommit } from "./git-shadow";
import { applyRanges, type LineRange } from "./apply-lines";
import { diffDisplay, unifiedPatch } from "./display";
import {
  bumpFailure,
  clearFailures,
  fileHash,
  getRead,
  hasLineAnchor,
  recordRead,
  recordWrite,
  root,
  syncTracked,
} from "./state";
import type { Region } from "./parse-search-replace";
import type { PatchFile } from "./parse-apply-patch";

export interface Target {
  path: string;
  regions?: Region[];
  file?: PatchFile;
  ranges?: LineRange[];
}

function rel(abs: string): string {
  return path.relative(root(), abs);
}

async function processTarget(
  t: Target,
  o: {
    seed: string;
    blocks: number;
    patch: number;
    out: string[];
    displays: import("@cagent/sdk").ToolDisplay[];
    changedRanges: Array<{
      path: string;
      startLine: number;
      endLine: number;
    }>;
  },
): Promise<boolean> {
  let abs: string;
  try {
    abs = guardPath(t.path);
  } catch (e) {
    o.out.push(
      errorText(
        "E_PATH",
        `${t.path}: ${e instanceof Error ? e.message : String(e)}`,
      ),
    );
    return false;
  }
  const op = t.file?.op ?? "update";
  let moveAbs: string | undefined;
  if (t.file?.movePath) {
    try {
      moveAbs = guardPath(t.file.movePath);
    } catch (e) {
      o.out.push(
        errorText(
          "E_PATH",
          `${t.file.movePath}: ${e instanceof Error ? e.message : String(e)}`,
        ),
      );
      return false;
    }
  }
  if (moveAbs && fs.existsSync(moveAbs)) {
    o.out.push(
      errorText(
        "E_EXISTS",
        `${t.file?.movePath}: move destination already exists`,
      ),
    );
    return false;
  }
  if (op === "delete") {
    try {
      fs.rmSync(abs);
    } catch {
      o.out.push(errorText("E_NOT_FOUND", t.path));
      return false;
    }
    recordWrite(abs, "");
    o.out.push(`OK ${rel(abs)} (removed)`);
    return true;
  }
  let original: string;
  let missing = false;
  try {
    original = fs.readFileSync(abs, "utf8");
  } catch {
    missing = true;
    original = "";
  }
  if (op === "add") {
    if (!missing) {
      o.out.push(
        errorText(
          "E_EXISTS",
          `${t.path}: file already exists - use Update (blocks/patch) instead of Add`,
        ),
      );
      return false;
    }
  } else if (missing) {
    o.out.push(errorText("E_NOT_FOUND", t.path));
    return false;
  }
  const prev = getRead(abs);
  if (prev && prev.hash !== fileHash(abs)) {
    o.out.push(
      errorText("E_STALE", `${t.path}: file changed since the last read_file`),
    );
    return false;
  }
  if (t.ranges && !hasLineAnchor(abs)) {
    o.out.push(
      errorText(
        "E_STALE",
        `${t.path}: line numbers are not current - call read_file on ${t.path} and use the numbers it returns`,
      ),
    );
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
    const detail =
      "message" in applied.error
        ? applied.error.message
        : `target ${JSON.stringify(applied.error.search.slice(0, 80))}`;
    o.out.push(
      errorText(
        n >= 3 ? "E_REPEATED_FAILURE" : applied.error.code,
        n >= 3
          ? `${t.path}: 3 consecutive failures with the same target - read the file and reformulate the edit`
          : n === 2
            ? `${t.path}: use read_file on ${t.path} to see the current content`
            : `${t.path}: ${detail}`,
      ),
    );
    return false;
  }
  const next =
    (original.startsWith("\uFEFF") ? "\uFEFF" : "") + applied.lines.join(eol);
  try {
    atomicWrite(abs, next);
    if (moveAbs) {
      if (fs.existsSync(moveAbs))
        throw new Error(`move destination already exists: ${t.file?.movePath}`);
      fs.mkdirSync(path.dirname(moveAbs), { recursive: true });
      fs.renameSync(abs, moveAbs);
    }
  } catch (e) {
    o.out.push(
      errorText(
        "E_WRITE",
        `${t.path}: ${e instanceof Error ? e.message : String(e)}`,
      ),
    );
    return false;
  }
  recordRead(moveAbs ?? abs);
  recordWrite(moveAbs ?? abs, next);
  clearFailures(abs);
  const changedLines = applied.lines.length - oldLines.length;
  o.changedRanges.push({
    path: moveAbs ?? abs,
    startLine: 1,
    endLine: Math.max(1, oldLines.length + Math.max(0, changedLines)),
  });
  const diff = unifiedDiff(oldLines, applied.lines).split("\n");
  const label = moveAbs ? `${rel(abs)} -> ${rel(moveAbs)}` : rel(abs);
  o.out.push(
    `OK ${label}\n${diff.slice(0, 100).join("\n")}${diff.length > 100 ? "\n…" : ""}`,
  );
  const display = diffDisplay(
    unifiedPatch(oldLines, applied.lines, label),
    label,
  );
  if (display) o.displays.push(display);
  return true;
}

export async function applyTargets(
  targets: Target[],
  o: { seed: string; blocks: number; patch: number },
  ctx: PluginContext,
  label: string,
): Promise<{
  output: string;
  isError: boolean;
  changesWorkspace?: boolean;
  changedRanges: Array<{
    path: string;
    startLine: number;
    endLine: number;
  }>;
  display?: import("@cagent/sdk").ToolDisplay;
}> {
  const tscBefore = await tscErrors(root());
  const out: string[] = [];
  const displays: import("@cagent/sdk").ToolDisplay[] = [];
  const changedRanges: Array<{
    path: string;
    startLine: number;
    endLine: number;
  }> = [];
  let ok = 0;
  for (const t of targets)
    if (await processTarget(t, { ...o, out, displays, changedRanges })) ok++;

  const fmt = await runFormat(root());
  // ponytail: the format step rewrites the whole project on disk after recordRead/recordWrite, so resync every tracked path from the filesystem; a stale hash would trip E_STALE on the next edit.
  syncTracked();
  const tscAfter = await tscErrors(root());
  const newErrors = tscAfter.filter((l) => !tscBefore.includes(l));
  if (fmt) out.push(`format:\n${fmt.slice(0, 500)}`);
  if (newErrors.length)
    out.push(`new tsc errors:\n${newErrors.slice(0, 20).join("\n")}`);
  if (ok) {
    await ensureShadow();
    await shadowCommit(`${label} ${ok} file(s)`);
  }
  ctx.emit("code-tools/edit", {
    ok,
    failed: targets.length - ok,
    newErrors,
    paths: targets.map((target) => target.path),
  });
  return {
    output: out.join("\n"),
    isError: ok === 0,
    changesWorkspace: ok > 0,
    changedRanges,
    display: displays.length === 1 ? displays[0] : undefined,
  };
}
