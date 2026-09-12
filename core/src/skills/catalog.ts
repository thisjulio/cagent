import type { SkillCatalog } from "./types";

export function renderSkillCatalog(catalog: SkillCatalog): string {
  if (!catalog.skills.length) return "";
  return [
    "Skills are specialized instruction sets. Use read_skill when a request matches a skill.",
    "Read the skill before applying it.",
    "",
    ...catalog.skills.map((s) => `- ${s.metadata.name}: ${s.metadata.description} (directory: ${s.directory})`),
  ].join("\n");
}