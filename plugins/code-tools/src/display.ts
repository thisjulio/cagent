import path from "node:path";
import type { ToolDisplay } from "@cagent/sdk";
import { unifiedDiff } from "./diff";

export function filetypeForPath(file: string): string | undefined {
  const extension = path.extname(file).toLowerCase();
  const types: Record<string, string> = {
    ".c": "c",
    ".cpp": "cpp",
    ".css": "css",
    ".go": "go",
    ".html": "html",
    ".java": "java",
    ".js": "javascript",
    ".json": "json",
    ".jsx": "javascript",
    ".md": "markdown",
    ".py": "python",
    ".rs": "rust",
    ".sh": "bash",
    ".sql": "sql",
    ".toml": "toml",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".yaml": "yaml",
    ".yml": "yaml",
  };
  return types[extension];
}

export function diffDisplay(
  content: string,
  file: string,
): ToolDisplay | undefined {
  if (!content) return undefined;
  return {
    kind: "diff",
    content,
    filetype: filetypeForPath(file),
    path: file,
  };
}

export function unifiedPatch(
  oldLines: string[],
  newLines: string[],
  file: string,
): string {
  const body = unifiedDiff(oldLines, newLines).split("\n");
  const changed = body.flatMap((line, index) =>
    line.startsWith("+") || line.startsWith("-") ? [index] : [],
  );
  const first = changed[0] ?? 0;
  const last = changed.at(-1) ?? 0;
  const from = Math.max(0, first - 3);
  const to = Math.min(body.length, last + 4);
  return [
    `diff --git a/${file} b/${file}`,
    `--- ${file}`,
    `+++ ${file}`,
    `@@ -1,${oldLines.length} +1,${newLines.length} @@`,
    ...body.slice(from, to),
  ].join("\n");
}
