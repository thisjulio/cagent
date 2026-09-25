import fs from "node:fs";
import path from "node:path";

const cache = new Map<string, string[]>();

export function projectFiles(cwd: string): string[] {
  const root = path.resolve(cwd);
  const cached = cache.get(root);
  if (cached) return cached;
  const ignored = readIgnored(root);
  const files: string[] = [];
  walk(root, root, ignored, files);
  files.sort();
  cache.set(root, files);
  return files;
}

function walk(
  root: string,
  directory: string,
  ignored: string[],
  files: string[],
): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name === ".git") continue;
    const absolute = path.join(directory, entry.name);
    const relative = path.relative(root, absolute).replaceAll("\\", "/");
    if (
      ignored.some(
        (pattern) => relative === pattern || relative.startsWith(`${pattern}/`),
      )
    )
      continue;
    if (entry.isDirectory()) walk(root, absolute, ignored, files);
    else if (entry.isFile()) files.push(relative);
  }
}

function readIgnored(root: string): string[] {
  try {
    return fs
      .readFileSync(path.join(root, ".gitignore"), "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim().replace(/\/$/, ""))
      .filter((line) => line && !line.startsWith("#") && !line.includes("*"));
  } catch {
    return [];
  }
}
