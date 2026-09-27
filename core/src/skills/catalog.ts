import type { SkillCatalog } from "./types";

export function renderSkillCatalog(catalog: SkillCatalog): string {
  if (!catalog.skills.length) return "";
  return [
    "Skills are specialized instruction sets. Use the skill tool when a request matches an available skill.",
    'Call the skill tool with the exact skill id as the "name" argument; omit "resource" to load its SKILL.md. To load a referenced file, pass its exact relative path from the skill_files list as "resource".',
    'The _cagent "title" is free display text; "name" must stay the exact id from the list below, never the title text or the description.',
    "Read the skill before applying it. Once loaded, do not load it again in this session; reuse its instructions from the earlier result.",
    "",
    ...catalog.skills
      .filter((s) => !s.metadata.disableModelInvocation)
      .map(
        (s) =>
          `- ${s.metadata.name}: ${s.metadata.description} (directory: ${s.directory})`,
      ),
  ].join("\n");
}
