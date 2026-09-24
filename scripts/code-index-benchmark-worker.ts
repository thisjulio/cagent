import fs from "node:fs/promises";
import path from "node:path";
import { parseFile } from "../plugins/code-index/src/tags";

const grammars: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "tsx",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".rs": "rust",
  ".go": "go",
  ".java": "java",
  ".c": "c",
  ".h": "c",
  ".cc": "cpp",
  ".cxx": "cpp",
  ".cpp": "cpp",
  ".hh": "cpp",
  ".hxx": "cpp",
  ".hpp": "cpp",
  ".mm": "cpp",
  ".css": "css",
  ".html": "html",
  ".json": "json",
  ".toml": "toml",
};

const [root, ...files] = process.argv.slice(2);
if (!root) throw new Error("missing repository root");
const tags: string[] = [];
const errors: string[] = [];
for (const file of files) {
  try {
    const source = await fs.readFile(path.join(root, file), "utf8");
    for (const tag of await parseFile(
      path.join(root, file),
      source,
      grammars[path.extname(file)],
    )) {
      tags.push(`${file}:${tag.line}:${tag.name}`);
    }
  } catch (error) {
    errors.push(`${file}: ${String(error)}`);
  }
}
console.log(JSON.stringify({ tags, errors }));
