import fs from "node:fs/promises";
import path from "node:path";

const MAX_RESOURCE_BYTES = 100_000;
const MAX_LISTED_RESOURCES = 10;
const MAX_RESOURCE_DEPTH = 8;

export async function listSkillResources(directory: string): Promise<string[]> {
  try {
    const files = await collectFiles(directory, directory);
    return files
      .filter((file) => file !== "SKILL.md")
      .sort()
      .slice(0, MAX_LISTED_RESOURCES);
  } catch {
    return [];
  }
}

export async function readSkillResource(
  directory: string,
  resource: string,
): Promise<string | undefined> {
  if (!resource || path.isAbsolute(resource) || resource.includes("\\"))
    return undefined;
  try {
    const root = await fs.realpath(directory);
    const file = await fs.realpath(path.resolve(root, resource));
    const relative = path.relative(root, file);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative))
      return undefined;
    const stat = await fs.stat(file);
    if (!stat.isFile() || stat.size > MAX_RESOURCE_BYTES) return undefined;
    return await fs.readFile(file, "utf8");
  } catch {
    return undefined;
  }
}

async function collectFiles(
  root: string,
  directory: string,
  depth = 0,
): Promise<string[]> {
  if (depth > MAX_RESOURCE_DEPTH) return [];
  const files: string[] = [];
  const entries = await fs.readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    if (files.length > MAX_LISTED_RESOURCES) break;
    if (entry.name.startsWith(".")) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory())
      files.push(...(await collectFiles(root, file, depth + 1)));
    else if (entry.isFile()) files.push(path.relative(root, file));
  }
  return files;
}
