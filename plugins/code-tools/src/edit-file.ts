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
import { bumpFailure, clearFailures, fileHash, getRead, recordRead, recordWrite, root } from "./state";
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
}

async function processTarget(t: Target, o: { seed: string; blocks: number; patch: number; out: string[] }): Promise<boolean> {
  let abs: string;
  try { abs = guardPath(t.path); } catch (e) { o.out.push(errorText("E_PATH", `${t.path}: ${e instanceof Error ? e.message : String(e)}`)); return false; }
  const op = t.file?.op ?? "update";
  if (op === "delete") {
    try { fs.rmSync(abs); } catch { o.out.push(errorText("E_NOT_FOUND", t.path)); return false; }
    recordWrite(abs, "");
    o.out.push(`OK ${rel(abs)} (removido)`);
    return true;
  }
  let original: string;
  let missing = false;
  try { original = fs.readFileSync(abs, "utf8"); }
  catch { missing = true; original = ""; }
  if (op === "add") {
    if (!missing) { o.out.push(errorText("E_EXISTS", `${t.path}: arquivo já existe — use Update (blocos/patch) em vez de Add`)); return false; }
  } else if (missing) {
    o.out.push(errorText("E_NOT_FOUND", t.path));
    return false;
  }
  const prev = getRead(abs);
  if (prev && prev.hash !== fileHash(abs)) {
    o.out.push(errorText("E_STALE", `${t.path}: arquivo mudou desde o último read_file`));
    return false;
  }
  const body = original.startsWith("\uFEFF") ? original.slice(1) : original;
  const eol = body.includes("\r\n") ? "\r\n" : "\n";
  const oldLines = body.length ? body.split(eol) : [];
  const applied = t.regions ? applyRegions(oldLines, t.regions, o.blocks) : applyHunks(oldLines, t.file!, o.patch);
  if (applied.error) {
    const n = bumpFailure(abs, o.seed);
    o.out.push(errorText(n >= 3 ? "E_REPEATED_FAILURE" : applied.error.code, n >= 3 ? `${t.path}: 3 falhas seguidas com o mesmo alvo — leia o arquivo e reformule a edição` : n === 2 ? `${t.path}: use read_file em ${t.path} para ver o conteúdo atual` : `${t.path}: alvo ${JSON.stringify(applied.error.search.slice(0, 80))}`));
    return false;
  }
  const next = (original.startsWith("\uFEFF") ? "\uFEFF" : "") + applied.lines.join(eol);
  try {
    atomicWrite(abs, next);
  } catch (e) {
    o.out.push(errorText("E_WRITE", `${t.path}: ${e instanceof Error ? e.message : String(e)}`));
    return false;
  }
  recordRead(abs);
  recordWrite(abs, next);
  clearFailures(abs);
  const diff = unifiedDiff(oldLines, applied.lines).split("\n");
  o.out.push(`OK ${rel(abs)}\n${diff.slice(0, 100).join("\n")}${diff.length > 100 ? "\n…" : ""}`);
  return true;
}

async function runEdit(args: ToolArgs, ctx: PluginContext, blocks: number, patch: number): Promise<{ output: string; isError: boolean }> {
  const argBlocks = typeof args.blocks === "string" ? args.blocks : undefined;
  const argPatch = typeof args.patch === "string" ? args.patch : undefined;
  if (!argBlocks && !argPatch) return { output: errorText("E_PARSE", "informe 'blocks' ou 'patch'"), isError: true };
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

  const tscBefore = await tscErrors(root());
  const out: string[] = [];
  let ok = 0;
  for (const t of targets) if (await processTarget(t, { seed, blocks, patch, out })) ok++;

  const fmt = await runFormat(root());
  const tscAfter = await tscErrors(root());
  const newErrors = tscAfter.filter((l) => !tscBefore.includes(l));
  if (fmt) out.push(`format:\n${fmt.slice(0, 500)}`);
  if (newErrors.length) out.push(`novos erros tsc:\n${newErrors.slice(0, 20).join("\n")}`);
  if (ok) {
    await ensureShadow();
    await shadowCommit(`edit ${ok} arquivo(s)`);
  }
  ctx.emit("code-tools/edit", { ok, failed: targets.length - ok, newErrors });
  return { output: out.join("\n"), isError: ok === 0 };
}

export function editFileTool(ctx: PluginContext) {
  const thresholdBlocks = num(ctx.config.threshold_search_replace, 0.75);
  const thresholdPatch = num(ctx.config.threshold_apply_patch, 0.85);

  return defineTool(
    "edit_file",
    "Edita/cria/remove arquivos por blocos << SEARCH >> / << REPLACE >> (arg blocks) ou patch *** Begin patch (arg patch, com *** Update/Add/Delete File: e @@ hunks). Falhas repetidas: 2ª pede read_file, 3ª é fatal.",
    {
      type: "object",
      properties: {
        path: { type: "string", description: "Caminho do arquivo (para blocks; o patch traz o próprio caminho)" },
        blocks: { type: "string", description: "Blocos << SEARCH >> / << REPLACE >>" },
        patch: { type: "string", description: "Patch completo no formato *** Begin patch / *** End patch" },
      },
    },
    (args: ToolArgs) => runEdit(args, ctx, thresholdBlocks, thresholdPatch),
  );
}
