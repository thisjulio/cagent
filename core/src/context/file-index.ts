import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { fuzzy } from "../fuzzy";

type ProjectFileIndex = {
  files?: string[];
  pending?: Promise<string[]>;
  generation: number;
  matches: Map<string, string[]>;
};

const execFileAsync = promisify(execFile);
const indexes = new Map<string, ProjectFileIndex>();

function indexFor(cwd: string): ProjectFileIndex {
  const root = path.resolve(cwd);
  let index = indexes.get(root);
  if (!index) {
    index = { generation: 0, matches: new Map() };
    indexes.set(root, index);
  }
  return index;
}

export function hasProjectFiles(cwd = process.cwd()): boolean {
  return indexFor(cwd).files !== undefined;
}

export async function loadProjectFiles(cwd = process.cwd()): Promise<string[]> {
  const root = path.resolve(cwd);
  const index = indexFor(root);
  if (index.files) return index.files;
  if (index.pending) return index.pending;

  const generation = index.generation;
  index.pending = execFileAsync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    {
      cwd: root,
      encoding: "utf-8",
      timeout: 10_000,
      maxBuffer: 32 * 1024 * 1024,
    },
  )
    .then(({ stdout }) => stdout.split("\0").filter(Boolean).sort())
    .catch(() => [])
    .then((files) => {
      if (index.generation !== generation) return loadProjectFiles(root);
      index.files = files;
      index.pending = undefined;
      index.matches.clear();
      return files;
    });
  return index.pending;
}

export function invalidateProjectFiles(cwd = process.cwd()): void {
  const index = indexes.get(path.resolve(cwd));
  if (!index) return;
  index.generation++;
  index.files = undefined;
  index.pending = undefined;
  index.matches.clear();
}

export function fuzzyProjectFiles(
  query: string,
  cwd = process.cwd(),
): string[] {
  const index = indexFor(cwd);
  const files = index.files ?? [];
  const normalized = query.toLowerCase();
  if (!normalized) return files.slice(0, 8);

  let candidates = index.matches.get(normalized);
  if (!candidates) {
    for (let length = normalized.length - 1; length > 0; length--) {
      const prefix = index.matches.get(normalized.slice(0, length));
      if (!prefix) continue;
      candidates = prefix;
      break;
    }
    candidates ??= files;
    const matches = fuzzy(candidates, normalized);
    if (index.matches.size >= 32) index.matches.clear();
    index.matches.set(normalized, matches);
    candidates = matches;
  }
  return candidates.slice(0, 8);
}
