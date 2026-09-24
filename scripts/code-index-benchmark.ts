import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileGrammars } from "../plugins/code-index/src/grammar";
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
  "flask",
  "gin",
  "guava",
  "json",
  "p-limit",
  "ripgrep",
  "express",
  "gh-cli",
  "bytes",
  "fmt",
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
  scope?: string;
  scopeKind?: string;
};

async function filesIn(root: string, dir = root): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && !ignored.has(entry.name))
      found.push(...(await filesIn(root, path.join(dir, entry.name))));
    else if (entry.isFile() && fileGrammars[path.extname(entry.name)])
      found.push(path.relative(root, path.join(dir, entry.name)));
  }
  return found.sort();
}

const configuredWorkers = Number(
  process.env.CODE_INDEX_WORKERS ?? os.availableParallelism(),
);
if (!Number.isInteger(configuredWorkers) || configuredWorkers < 1)
  throw new Error("CODE_INDEX_WORKERS must be a positive integer");
const workers = Math.min(configuredWorkers, 8);

async function extract(root: string, files: string[]) {
  const shards: Array<{ files: string[]; bytes: number }> = Array.from(
    { length: Math.min(workers, files.length) },
    () => ({ files: [], bytes: 0 }),
  );
  const sizes = await Promise.all(
    files.map(async (file) => ({
      file,
      bytes: (await fs.stat(path.join(root, file))).size,
    })),
  );
  for (const { file, bytes } of sizes.sort((a, b) => b.bytes - a.bytes)) {
    const shard = shards.reduce((smallest, next) =>
      next.bytes < smallest.bytes ? next : smallest,
    );
    shard.files.push(file);
    shard.bytes += bytes;
  }
  const results = await Promise.all(
    shards.map(async (shard) => {
      const proc = Bun.spawn(
        [
          process.execPath,
          path.join(import.meta.dir, "code-index-benchmark-worker.ts"),
          root,
          ...shard.files,
        ],
        { stdout: "pipe", stderr: "pipe" },
      );
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]);
      if (exitCode !== 0)
        throw new Error(`parser worker failed (${exitCode}): ${stderr}`);
      return JSON.parse(stdout) as {
        tags: string[];
        errors: string[];
        languages: Record<string, string>;
      };
    }),
  );
  return {
    ours: new Set(results.flatMap((result) => result.tags)),
    errors: results.flatMap((result) => result.errors),
    languages: Object.assign(
      {},
      ...results.map((result) => result.languages),
    ) as Record<string, string>,
  };
}

async function compare(root: string) {
  const files = await filesIn(root);
  const byLanguage: Record<string, number> = {};
  const extraction = extract(root, files);
  const proc = Bun.spawn(
    [
      "ctags",
      "--output-format=json",
      "--fields=+nK",
      "--extras=-q",
      "--languages=C,C++,CSS,Go,HTML,Java,JavaScript,JSON,Python,Rust,TOML,TypeScript",
      "-f",
      "-",
      ...files,
    ],
    { cwd: root, stdout: "pipe", stderr: "pipe" },
  );
  const [ctagsOutput, ctagsErrors, exitCode, { ours, errors, languages }] =
    await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
      extraction,
    ]);
  for (const grammar of Object.values(languages))
    byLanguage[grammar] = (byLanguage[grammar] ?? 0) + 1;
  if (exitCode !== 0) throw new Error(ctagsErrors);
  const baseline = new Map<string, BaselineTag>();
  for (const line of ctagsOutput.split("\n")) {
    if (!line) continue;
    const tag = JSON.parse(line) as BaselineTag;
    if (
      tag._type !== "tag" ||
      !tag.line ||
      !tag.path ||
      !kinds.has(tag.kind) ||
      tag.name.startsWith("anonymous") ||
      tag.name.startsWith("__anon")
    )
      continue;
    // Keep the baseline's declared spelling, including C++ qualified names.
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
  const eligible = [...baseline.entries()].filter(([key, tag]) => {
    const file = key.slice(0, key.indexOf(":"));
    const grammar = languages[file];
    if (!["javascript", "typescript", "tsx"].includes(grammar ?? ""))
      return true;
    return (
      !tag.scope ||
      !["function", "method", "generator"].includes(tag.scopeKind ?? "")
    );
  });
  const eligibleHits = eligible.filter(([key]) => ours.has(key)).length;
  const recallByLanguage: Record<
    string,
    { matched: number; baseline: number; recall: number }
  > = {};
  for (const key of baseline.keys()) {
    const grammar = languages[key.slice(0, key.indexOf(":"))];
    if (!grammar) continue;
    const row = recallByLanguage[grammar] ?? {
      matched: 0,
      baseline: 0,
      recall: 0,
    };
    row.baseline++;
    if (ours.has(key)) row.matched++;
    row.recall = row.matched / row.baseline;
    recallByLanguage[grammar] = row;
  }
  return {
    root,
    files: files.length,
    byLanguage,
    recallByLanguage,
    pluginTags: ours.size,
    ctagsTags: baseline.size,
    matched: matched.length,
    recall: baseline.size ? matched.length / baseline.size : null,
    moduleRecall: eligible.length ? eligibleHits / eligible.length : null,
    moduleMatched: eligibleHits,
    moduleBaseline: eligible.length,
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
