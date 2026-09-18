import { findBlock } from "./ladder";
import type { Region } from "./parse-search-replace";
import type { PatchFile } from "./parse-apply-patch";

export type ApplyError = { code: "E_NO_MATCH" | "E_AMBIGUOUS"; search: string };

export function applyRegions(
  lines: string[],
  regions: Region[],
  threshold: number,
): { lines: string[]; error?: ApplyError } {
  const result = [...lines];
  for (const r of regions) {
    const m = findBlock(result, r.search, threshold);
    if (m === "ambiguous")
      return {
        lines: result,
        error: { code: "E_AMBIGUOUS", search: r.search },
      };
    if (!m)
      return { lines: result, error: { code: "E_NO_MATCH", search: r.search } };
    const newLines = r.replace === null ? [] : r.replace.split("\n");
    result.splice(m.start, m.count, ...newLines);
  }
  return { lines: result };
}

export function applyHunks(
  lines: string[],
  file: PatchFile,
  threshold: number,
): { lines: string[]; error?: ApplyError } {
  const result = [...lines];
  for (const h of file.hunks) {
    // ponytail: a context-free hunk (only +) replaces the entire file.
    if (!h.oldLines.length) {
      result.length = 0;
      result.push(...h.newLines);
      continue;
    }
    const m = findBlock(result, h.oldLines.join("\n"), threshold);
    if (m === "ambiguous")
      return {
        lines: result,
        error: { code: "E_AMBIGUOUS", search: h.oldLines.join("\n") },
      };
    if (!m)
      return {
        lines: result,
        error: { code: "E_NO_MATCH", search: h.oldLines.join("\n") },
      };
    result.splice(m.start, m.count, ...h.newLines);
  }
  return { lines: result };
}
