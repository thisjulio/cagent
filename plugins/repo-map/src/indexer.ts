import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { extract, supported, type FileSymbols } from "./symbols";
import { ignored, loadRules, type IgnoreScopes } from "./ignore-rules";

type Entry = { mtime: number; size: number; symbols: FileSymbols };
type Cache = { version: number; root: string; entries: Record<string, Entry> };
const VERSION = 1;
const MAX_FILES = 2000;
const MAX_BYTES = 256_000;
const MAX_TOTAL_BYTES = 20_000_000;

const excludedDirectories = new Set([
  "node_modules",
  "vendor",
  "dist",
  "build",
  "coverage",
  "target",
  "graphify-out",
]);

async function enumerate(
  root: string,
  cacheDirectory: string,
): Promise<string[]> {
  const files: string[] = [];
  const pending: { directory: string; scopes: IgnoreScopes }[] = [
    { directory: "", scopes: [] },
  ];
  let visited = 0;
  while (pending.length && files.length < MAX_FILES && visited < 20_000) {
    const { directory, scopes: inherited } = pending.pop()!;
    const scopes = await loadRules(root, directory, inherited);
    const entries = await fs.readdir(path.join(root, directory), {
      withFileTypes: true,
    });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (++visited > 20_000 || files.length >= MAX_FILES) break;
      if (entry.name.startsWith(".")) continue;
      const relative = path.posix.join(directory, entry.name);
      if (path.resolve(root, relative) === path.resolve(cacheDirectory))
        continue;
      if (ignored(scopes, relative, entry.isDirectory())) continue;
      if (entry.isDirectory() && !excludedDirectories.has(entry.name))
        pending.push({ directory: relative, scopes });
      else if (entry.isFile() && supported(relative)) files.push(relative);
    }
  }
  return files.sort();
}

async function readCache(file: string, root: string): Promise<Cache> {
  try {
    const value = JSON.parse(await fs.readFile(file, "utf8")) as Cache;
    if (
      value.version === VERSION &&
      value.root === root &&
      value.entries &&
      typeof value.entries === "object"
    )
      return value;
  } catch {
    /* Missing or invalid caches are rebuilt. */
  }
  return { version: VERSION, root, entries: {} };
}

async function entryFor(
  root: string,
  file: string,
  old?: Entry,
): Promise<Entry | undefined> {
  const absolute = path.resolve(root, file);
  if (!absolute.startsWith(`${root}${path.sep}`)) return;
  const real = await fs.realpath(absolute);
  if (!real.startsWith(`${root}${path.sep}`)) return;
  const stat = await fs.lstat(absolute);
  if (!stat.isFile() || stat.size > MAX_BYTES) return;
  if (
    old?.mtime === stat.mtimeMs &&
    old.size === stat.size &&
    old.symbols?.file === file &&
    Array.isArray(old.symbols.definitions) &&
    Array.isArray(old.symbols.references) &&
    Array.isArray(old.symbols.imports)
  )
    return old;
  return {
    mtime: stat.mtimeMs,
    size: stat.size,
    symbols: extract(file, await fs.readFile(absolute, "utf8")),
  };
}

export async function buildIndex(options: {
  root: string;
  cacheDirectory: string;
  warn: (message: string) => void;
}): Promise<FileSymbols[]> {
  const root = await fs.realpath(options.root);
  const key = createHash("sha256").update(root).digest("hex");
  const cacheFile = path.join(options.cacheDirectory, `${key}.json`);
  const previous = await readCache(cacheFile, root);
  const entries: Record<string, Entry> = Object.create(null);
  let bytes = 0;
  for (const file of await enumerate(root, options.cacheDirectory)) {
    try {
      const entry = await entryFor(root, file, previous.entries[file]);
      if (!entry) continue;
      bytes += entry.size;
      if (bytes > MAX_TOTAL_BYTES) break;
      entries[file] = entry;
    } catch (error) {
      options.warn(`Skipped ${file}: ${String(error)}`);
    }
  }
  try {
    await fs.mkdir(options.cacheDirectory, { recursive: true, mode: 0o700 });
    const temporary = `${cacheFile}.${crypto.randomUUID()}.tmp`;
    await fs.writeFile(
      temporary,
      JSON.stringify({ version: VERSION, root, entries }),
      { mode: 0o600 },
    );
    await fs.rename(temporary, cacheFile);
  } catch (error) {
    options.warn(`Could not persist repository map cache: ${String(error)}`);
  }
  return Object.values(entries).map((entry) => entry.symbols);
}
