import type { SkillCatalog, SkillRecord } from "./types";

// ponytail: the model sometimes copies the _cagent title or the catalog
// description into "name"; resolve those to the exact id so one slip does
// not fail the whole skill call.
export function resolveSkill(
  catalog: SkillCatalog,
  rawName: string,
): SkillRecord | undefined {
  const exact = catalog.byName.get(rawName);
  if (exact) return exact;
  const trimmed = rawName.trim();
  if (trimmed !== rawName) {
    const retry = catalog.byName.get(trimmed);
    if (retry) return retry;
  }
  const lowered = trimmed.toLowerCase();
  const withoutPrefix = lowered.startsWith("skill ")
    ? lowered.slice("skill ".length).trim()
    : lowered;
  for (const skill of catalog.byName.values()) {
    if (skill.metadata.name.toLowerCase() === withoutPrefix) return skill;
  }
  for (const skill of catalog.byName.values()) {
    if (skill.metadata.description.trim().toLowerCase() === withoutPrefix)
      return skill;
  }
  return undefined;
}
