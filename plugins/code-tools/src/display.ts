import path from "node:path";
import type { ToolDisplay } from "@cagent/sdk";

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
  const body = oldLines
    .map((line) => `-${line}`)
    .concat(newLines.map((line) => `+${line}`));
  return [
    `--- ${file}`,
    `+++ ${file}`,
    `@@ -1,${oldLines.length} +1,${newLines.length} @@`,
    ...body,
  ].join("\n");
}
