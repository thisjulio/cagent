import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { parseSkill } from "./frontmatter";
import type { SkillCatalog, SkillRecord } from "./types";

export function discoverSkills(cwd: string, roots: string[] = []): SkillCatalog {
  const candidates = roots.length ? roots : [
    ".cagent/skills",
    path.join(os.homedir(), ".cagent", "skills"),
  ];
  const byName = new Map<string, SkillRecord>();
  for (const root of candidates) {
    const directory = path.resolve(cwd, root);
    if (!fs.existsSync(directory)) continue;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory() || byName.has(entry.name)) continue;
      const instructionFile = path.join(directory, entry.name, "SKILL.md");
      if (!fs.existsSync(instructionFile)) continue;
      try {
        const metadata = parseSkill(fs.readFileSync(instructionFile, "utf8"), entry.name);
        byName.set(metadata.name, { metadata, directory: path.join(directory, entry.name), instructionFile });
      } catch { /* invalid skills are unavailable */ }
    }
  }
  return { skills: [...byName.values()], byName };
}