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
const ignored = new Set([
  ".git",
  "node_modules",
  "target",
  "dist",
  ".venv",
  "venv",
  ".cagent",
  "graphify-out",
]);
const repos = [
  "express",
  "p-limit",
  "fmt",
  "json",
  "bytes",
  "ripgrep",
  "guava",
  "junit5",
  "cagent",
];
const kinds = new Set([
  "function",
  "method",
  "generator",
  "class",
  "interface",
  "struct",
  "union",
  "enum",
  "enumerator",
  "typedef",
  "namespace",
  "member",
  "field",
  "macro",
  "constant",
  "variable",
]);

type BaselineTag = {
  _type: string;
  path: string;
  name: string;
  line: number;
  kind: string;
};

async function filesIn(root: string, dir = root): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && !ignored.has(entry.name))
      found.push(...(await filesIn(root, path.join(dir, entry.name))));
    else if (entry.isFile() && grammars[path.extname(entry.name)])
      found.push(path.relative(root, path.join(dir, entry.name)));
  }
  return found.sort();
}

async function compare(root: string) {
  const files = await filesIn(root);
  const ours = new Set<string>();
  const byLanguage: Record<string, number> = {};
  const errors: string[] = [];
  for (const file of files) {
    const grammar = grammars[path.extname(file)]!;
    byLanguage[grammar] = (byLanguage[grammar] ?? 0) + 1;
    try {
      for (const tag of await parseFile(
        path.join(root, file),
        await fs.readFile(path.join(root, file), "utf8"),
        grammar,
      )) {
        ours.add(`${file}:${tag.line}:${tag.name}`);
      }
    } catch (error) {
      errors.push(`${file}: ${String(error)}`);
    }
  }
  const proc = Bun.spawnSync(
    [
      "ctags",
      "--output-format=json",
      "--fields=+nK",
      "--extras=+q",
      "--languages=C,C++,CSS,Go,HTML,Java,JavaScript,JSON,Python,Rust,TOML,TypeScript",
      "-f",
      "-",
      ...files,
    ],
    { cwd: root, stdout: "pipe", stderr: "pipe" },
  );
  if (proc.exitCode !== 0)
    throw new Error(new TextDecoder().decode(proc.stderr));
  const baseline = new Map<string, BaselineTag>();
  for (const line of new TextDecoder().decode(proc.stdout).split("\n")) {
    if (!line) continue;
    const tag = JSON.parse(line) as BaselineTag;
    if (tag._type !== "tag" || !tag.line || !tag.path || !kinds.has(tag.kind))
      continue;
    // Qualified C++ names (e.g. Box::run) are not reduced to their leaf by splitting on dots.
    // Preserve the full spelling here so mismatches remain visible in diagnostics.
    const key = `${path.relative(root, path.resolve(root, tag.path))}:${tag.line}:${tag.name}`;
    baseline.set(key, tag);
  }
  const matched = [...baseline.keys()].filter((key) => ours.has(key));
  const misses = [...baseline.keys()].filter((key) => !ours.has(key));
  const missingByKind: Record<string, number> = {};
  for (const key of misses) {
    const kind = baseline.get(key)!.kind;
    missingByKind[kind] = (missingByKind[kind] ?? 0) + 1;
  }
  return {
    root,
    files: files.length,
    byLanguage,
    pluginTags: ours.size,
    ctagsTags: baseline.size,
    matched: matched.length,
    recall: baseline.size ? matched.length / baseline.size : null,
    missingByKind,
    misses: misses.slice(0, 20),
    errors,
  };
}

const campaign = process.env.CODE_INDEX_CORPUS ?? "/tmp/code-index-campaign";
for (const repo of process.argv.slice(2).length
  ? process.argv.slice(2)
  : repos) {
  const root =
    repo === "cagent"
      ? path.resolve(import.meta.dir, "..")
      : path.resolve(campaign, repo);
  console.log(JSON.stringify({ repository: repo, ...(await compare(root)) }));
}
