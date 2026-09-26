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
  const changes: Array<{ start: number; end: number }> = [];
  for (let index = 0; index < body.length; index++) {
    if (!body[index].startsWith("+") && !body[index].startsWith("-")) continue;
    const last = changes.at(-1);
    if (last && index - last.end <= 7) last.end = index;
    else changes.push({ start: index, end: index });
  }
  const hunks = changes.map(({ start, end }) => {
    const from = Math.max(0, start - 3);
    const to = Math.min(body.length, end + 4);
    const lines = body.slice(from, to);
    let oldLine = 0;
    let newLine = 0;
    for (const line of body.slice(0, from)) {
      if (!line.startsWith("+")) newLine++;
      if (!line.startsWith("-")) oldLine++;
    }
    const oldCount = lines.filter((line) => !line.startsWith("+")).length;
    const newCount = lines.filter((line) => !line.startsWith("-")).length;
    const oldStart = oldCount === 0 ? oldLine : oldLine + 1;
    const newStart = newCount === 0 ? newLine : newLine + 1;
    return [
      `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`,
      ...lines,
    ];
  });
  return [
    `diff --git a/${file} b/${file}`,
    `--- ${file}`,
    `+++ ${file}`,
    ...hunks.flat(),
  ].join("\n");
}
