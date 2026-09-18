import type { SkillCatalog } from "./types";
import { readSkill } from "./read-tool";

const INVOCATION =
  /Call the Skill tool with ["']([a-z0-9]+(?:-[a-z0-9]+)*)["']/g;

export async function composeSkill(
  catalog: SkillCatalog,
  name: string,
  options: { userInvocable?: boolean; arguments?: string } = {},
): Promise<string | undefined> {
  const root = catalog.byName.get(name);
  if (!root || (options.userInvocable && root.metadata.userInvocable === false))
    return undefined;
  return expand(catalog, name, new Set<string>(), options.arguments ?? "");
}

async function expand(
  catalog: SkillCatalog,
  name: string,
  stack: Set<string>,
  args: string,
): Promise<string | undefined> {
  if (stack.has(name))
    throw new Error(
      `skill composition cycle: ${[...stack, name].join(" -> ")}`,
    );
  const content = await readSkill(catalog, name);
  if (content === undefined) return undefined;
  const nextStack = new Set(stack).add(name);
  const nested = [...content.matchAll(INVOCATION)].map((match) => match[1]);
  const composed = [];
  for (const nestedName of nested) {
    if (!catalog.byName.has(nestedName))
      throw new Error(`composed skill not found: ${nestedName}`);
    const nestedContent = await expand(catalog, nestedName, nextStack, args);
    if (nestedContent)
      composed.push(`\n## Composed skill: ${nestedName}\n\n${nestedContent}`);
  }
  return content.replace(/\$ARGUMENTS\b/g, args) + composed.join("");
}
