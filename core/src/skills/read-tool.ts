import fs from "node:fs/promises";
import path from "node:path";
import { defineTool, type ToolDefinition } from "@cagent/sdk";
import type { SkillCatalog } from "./types";

export async function readSkill(catalog: SkillCatalog, name: string): Promise<string | undefined> {
  const skill = catalog.byName.get(name);
  if (!skill) return undefined;
  if (skill.content) return skill.content;
  const file = path.resolve(skill.directory, "SKILL.md");
  try {
    const stat = await fs.stat(file);
    if (!stat.isFile() || stat.size > 100_000) return undefined;
    return fs.readFile(file, "utf8");
  } catch { return undefined; }
}

export function createReadSkillTool(catalog: SkillCatalog): ToolDefinition {
  return defineTool("read_skill", "Read a skill's SKILL.md or a relative reference file.", {
    type: "object", properties: { name: { type: "string" }, resource: { type: "string" } },
    required: ["name"], additionalProperties: false,
  }, async (args) => {
    const skill = typeof args.name === "string" ? catalog.byName.get(args.name) : undefined;
    if (!skill) return { output: `skill not found: ${String(args.name)}`, isError: true };
    const resource = typeof args.resource === "string" ? args.resource : "SKILL.md";
    if (resource === "SKILL.md") {
      const content = await readSkill(catalog, skill.metadata.name);
      if (content !== undefined) return { output: `Skill: ${skill.metadata.name}\nDirectory: ${skill.directory}\n\n${content}` };
    }
    const file = path.resolve(skill.directory, resource);
    if (!file.startsWith(`${skill.directory}${path.sep}`)) return { output: "skill resource is outside the skill directory", isError: true };
    try {
      const stat = await fs.stat(file);
      if (!stat.isFile() || stat.size > 100_000) return { output: "skill resource is missing or too large", isError: true };
      return { output: `Skill: ${skill.metadata.name}\nDirectory: ${skill.directory}\n\n${await fs.readFile(file, "utf8")}` };
    } catch { return { output: `skill resource not found: ${resource}`, isError: true }; }
  });
}
