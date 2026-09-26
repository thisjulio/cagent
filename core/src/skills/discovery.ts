import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { parseSkill } from "./frontmatter";
import type { SkillCatalog, SkillRecord } from "./types";

export function discoverSkills(
  cwd: string,
  roots: string[] = [],
  extraRoots: string[] = [],
): SkillCatalog {
  const home = os.homedir();
  const candidates = [
    ...roots,
    ...[".cagent/skills", ".agents/skills"].map((root) => path.join(cwd, root)),
    ...extraRoots,
    ...[".cagent/skills", ".agents/skills"].map((root) =>
      path.join(home, root),
    ),
  ];
  const byName = new Map<string, SkillRecord>();
  const visited = new Set<string>();
  for (const candidate of candidates) {
    const directory = path.resolve(cwd, candidate);
    if (visited.has(directory)) continue;
    visited.add(directory);
    if (!fs.existsSync(directory)) continue;
    discoverInDirectory(directory, byName);
  }
  return { skills: [...byName.values()], byName };
}

function discoverInDirectory(
  directory: string,
  byName: Map<string, SkillRecord>,
  depth = 0,
): void {
  if (depth > 8) return;
  const instructionFile = path.join(directory, "SKILL.md");
  try {
    const stat = fs.lstatSync(instructionFile);
    if (!stat.isFile() || stat.size > 100_000) return;
    try {
      const metadata = parseSkill(
        fs.readFileSync(instructionFile, "utf8"),
        path.basename(directory),
      );
      if (!byName.has(metadata.name))
        byName.set(metadata.name, { metadata, directory, instructionFile });
    } catch {
      /* Invalid skills stay unavailable; keep discovering sibling skills. */
    }
    return;
  } catch {
    // Continue looking through this directory when it has no readable SKILL.md.
  }
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (
      entry.isDirectory() &&
      !entry.name.startsWith(".") &&
      !["node_modules", "vendor"].includes(entry.name)
    )
      discoverInDirectory(path.join(directory, entry.name), byName, depth + 1);
  }
}
