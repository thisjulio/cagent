import { commandNames } from "./commands";

// ponytail: alphabetical order (not Object.keys) keeps suggestions predictable - "/session" before "/sessions".
const builtInSubcommands: Record<string, string[]> = {
  preference: ["add", "edit", "list", "remove", "toggle"],
};

export function slashSuggestions(
  input: string,
  skillNames: string[] = [],
  customNames: string[] = [],
  pluginSubcommands: Record<string, string[]> = {},
): string[] {
  if (!input.startsWith("/")) return [];
  const q = input.toLowerCase();
  const subcommand = input.match(/^\/([a-z0-9-]+)\s+([a-z0-9-]*)$/i);
  const subcommands =
    builtInSubcommands[subcommand?.[1]?.toLowerCase() ?? ""] ??
    pluginSubcommands[subcommand?.[1] ?? ""];
  if (subcommand && subcommands)
    return subcommands
      .map((name) => `/${subcommand[1]} ${name}`)
      .filter((name) => name.toLowerCase().startsWith(q))
      .sort();
  const commandMatches = [
    ...commandNames,
    ...customNames.map((name) => `/${name}`),
  ].filter((n) => n.startsWith(q));
  const skillPrefix = q.startsWith("/skill ")
    ? q.slice("/skill ".length)
    : null;
  if (skillPrefix === null) return commandMatches.sort();
  return skillNames
    .map((name) => `/skill ${name}`)
    .filter((name) => name.toLowerCase().startsWith(q))
    .sort();
}

export function subagentSuggestions(
  input: string,
  agentNames: string[] = [],
): string[] {
  const match = input.match(/^@([a-z0-9-]*)$/i);
  if (!match) return [];
  const query = match[1].toLowerCase();
  return agentNames
    .map((name) => `@${name}`)
    .filter((name) => name.slice(1).toLowerCase().startsWith(query))
    .sort();
}

export function inputSuggestions(
  input: string,
  skillNames: string[] = [],
  customNames: string[] = [],
  agentNames: string[] = [],
  pluginSubcommands: Record<string, string[]> = {},
): string[] {
  return input.startsWith("@")
    ? subagentSuggestions(input, agentNames)
    : slashSuggestions(input, skillNames, customNames, pluginSubcommands);
}
