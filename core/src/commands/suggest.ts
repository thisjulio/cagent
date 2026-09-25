import { commandNames } from "./commands";
import { getHelpCatalog } from "../ui/help-catalog";
import { fuzzy } from "../fuzzy";

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
    ...getHelpCatalog().map((item) => item.name),
    ...commandNames,
    ...customNames.map((name) => `/${name}`),
  ].filter(
    (n, index, all) =>
      all.indexOf(n) === index && n.toLowerCase().startsWith(q),
  );
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

export function fileSuggestions(input: string, filePaths: string[]): string[] {
  const match = input.match(/@([^\s]*)$/);
  if (!match) return [];
  const query = match[1].toLowerCase();
  return fuzzy(filePaths, query)
    .slice(0, 8)
    .map((path) => `@${path}`);
}

export function inputSuggestions(
  input: string,
  skillNames: string[] = [],
  customNames: string[] = [],
  agentNames: string[] = [],
  pluginSubcommands: Record<string, string[]> = {},
  filePaths: string[] = [],
): string[] {
  if (/(?:^|\s)@[^\s]*$/.test(input))
    return [
      ...subagentSuggestions(input, agentNames),
      ...fileSuggestions(input, filePaths),
    ].slice(0, 8);
  return slashSuggestions(input, skillNames, customNames, pluginSubcommands);
}
