import yaml from "js-yaml";
import type { SkillMetadata } from "./types";

export function parseSkill(text: string, directoryName: string): SkillMetadata {
  const match = text.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/);
  if (!match) throw new Error("missing YAML frontmatter");
  const data = yaml.load(match[1]);
  if (!data || typeof data !== "object")
    throw new Error("frontmatter must be a YAML object");
  const value = data as Record<string, unknown>;
  const name = value.name;
  const description = value.description;
  if (typeof name !== "string" || !name.trim())
    throw new Error("skill name is required");
  if (typeof description !== "string" || !description.trim())
    throw new Error("skill description is required");
  if (name !== directoryName)
    throw new Error(`skill name must match directory: ${directoryName}`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name))
    throw new Error(`invalid skill name: ${name}`);
  return {
    name,
    description: description.trim(),
    userInvocable: readBoolean(value, "user-invocable", true),
    disableModelInvocation: readBoolean(
      value,
      "disable-model-invocation",
      false,
    ),
  };
}

function readBoolean(
  value: Record<string, unknown>,
  key: string,
  fallback: boolean,
): boolean {
  const result = value[key];
  if (result === undefined) return fallback;
  if (typeof result !== "boolean") throw new Error(`${key} must be a boolean`);
  return result;
}
