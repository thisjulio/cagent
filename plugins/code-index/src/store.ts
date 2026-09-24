import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import type { PluginContext } from "@cagent/sdk";
import { fileGrammars, grammarFor } from "./grammar";
import { parseFile, type SymbolTag } from "./tags";

const TAG_CACHE_VERSION = 5;

export function createCodeIndex(ctx: PluginContext) {
  const root = path.resolve(process.cwd());
  const configuredBudget = Number(ctx.config.repo_map_tokens ?? 1500);
  const tokenBudget =
    Number.isFinite(configuredBudget) && configuredBudget > 0
      ? Math.floor(configuredBudget)
      : 1500;
  const cache = new Map<string, { hash: string; tags: SymbolTag[] }>();
  let dirty = true;
  let mapRows: string[] = [];
  let indexedFiles = new Set<string>();

  function workspacePath(file: string): string {
    const absolute = path.resolve(root, file);
    if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`))
      throw new Error("path is outside the workspace");
    return absolute;
  }

  async function fileTags(file: string): Promise<SymbolTag[]> {
    const abs = workspacePath(file);
    const realRoot = await fs.realpath(root);
    const realFile = await fs.realpath(abs);
    if (realFile !== realRoot && !realFile.startsWith(`${realRoot}${path.sep}`))
      throw new Error("path resolves outside the workspace");
    const source = await fs.readFile(abs, "utf8");
    const hash = createHash("sha256").update(source).digest("hex");
    const cached = cache.get(abs);
    if (cached?.hash === hash) return cached.tags;
    const relative = path.relative(root, abs).split(path.sep).join("/");
    const cacheKey = createHash("sha256")
      .update(`${TAG_CACHE_VERSION}\0${relative}\0${hash}`)
      .digest("hex");
    const cachePath = ctx.storage.path(`${cacheKey}.json`);
    const cachedTags = await fs
      .readFile(cachePath, "utf8")
      .then((contents) => JSON.parse(contents) as SymbolTag[])
      .catch(() => undefined);
    if (cachedTags) {
      cache.set(abs, { hash, tags: cachedTags });
      return cachedTags;
    }
    const tags = await parseFile(
      relative,
      source,
      grammarFor(relative, source),
    );
    cache.set(abs, { hash, tags });
    await fs.mkdir(path.dirname(cachePath), { recursive: true });
    await fs.writeFile(cachePath, JSON.stringify(tags), "utf8");
    return tags;
  }

  async function files(): Promise<string[]> {
    const found: string[] = [];
    const ignored = new Set([".git", "node_modules", "dist", ".cagent"]);
    async function walk(dir: string): Promise<void> {
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (!ignored.has(entry.name)) await walk(path.join(dir, entry.name));
        } else if (entry.isFile() && fileGrammars[path.extname(entry.name)]) {
          found.push(
            path
              .relative(root, path.join(dir, entry.name))
              .split(path.sep)
              .join("/"),
          );
        }
      }
    }
    await walk(root);
    return found;
  }

  return {
    tokenBudget,
    files,
    tags: fileTags,
    async invalidate(file: string) {
      let abs: string;
      try {
        abs = workspacePath(file);
      } catch {
        return;
      }
      cache.delete(abs);
      dirty = true;
      if (await fs.stat(abs).catch(() => undefined)) {
        try {
          await fileTags(abs);
        } catch {
          // Keep invalidation best-effort for deleted or unreadable files.
        }
      }
    },
    async repoMap(budget = tokenBudget): Promise<string> {
      const currentFiles = await files();
      const currentSet = new Set(currentFiles);
      if (
        currentSet.size !== indexedFiles.size ||
        [...currentSet].some((file) => !indexedFiles.has(file))
      )
        dirty = true;
      if (dirty) {
        const result: SymbolTag[] = [];
        for (const file of currentFiles) {
          try {
            result.push(...(await fileTags(file)));
          } catch {
            // Unsupported, unreadable, or malformed files do not block the map.
          }
        }
        dirty = false;
        indexedFiles = currentSet;
        mapRows = result
          .filter((tag) => !tag.isLocal)
          .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
          .map(
            (tag) =>
              `${tag.file}:${tag.line} ${tag.scope.length ? `${tag.scope.join(".")}.` : ""}${tag.name} [${tag.kind}] ${tag.signature}`,
          );
      }
      const parsedBudget = Number(budget);
      const safeBudget =
        Number.isFinite(parsedBudget) && parsedBudget > 0
          ? Math.floor(parsedBudget)
          : 0;
      const maxChars = safeBudget * 4;
      const header = "Repository symbols (derived, may be incomplete):";
      if (header.length > maxChars) return "";
      const output = [header];
      let chars = header.length;
      for (const row of mapRows) {
        if (chars + row.length + 1 > maxChars) break;
        output.push(row);
        chars += row.length + 1;
      }
      return output.length > 1 ? output.join("\n") : "";
    },
  };
}

export type CodeIndex = ReturnType<typeof createCodeIndex>;
