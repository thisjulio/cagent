import fs from "node:fs/promises";
import path from "node:path";
import { grammarFor } from "../plugins/code-index/src/grammar";
import { parseFile } from "../plugins/code-index/src/tags";

const [root, ...files] = process.argv.slice(2);
if (!root) throw new Error("missing repository root");
const tags: string[] = [];
const errors: string[] = [];
const languages: Record<string, string> = {};
for (const file of files) {
  try {
    const source = await fs.readFile(path.join(root, file), "utf8");
    const grammar = grammarFor(file, source);
    if (grammar) languages[file] = grammar;
    for (const tag of await parseFile(path.join(root, file), source, grammar)) {
      tags.push(`${file}:${tag.line}:${tag.name}`);
    }
  } catch (error) {
    errors.push(`${file}: ${String(error)}`);
  }
}
console.log(JSON.stringify({ tags, errors, languages }));
