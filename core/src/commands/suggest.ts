import { commandNames } from "./commands";

// ponytail: alphabetical order (not Object.keys) keeps suggestions predictable - "/session" before "/sessions".
export function slashSuggestions(input: string, skillNames: string[] = [], customNames: string[] = [], pluginSubcommands: Record<string, string[]> = {}): string[] {
  if (!input.startsWith("/")) return [];
  const q = input.toLowerCase();
  const commandMatches = [...commandNames, ...customNames.map((name) => `/${name}`)].filter((n) => n.startsWith(q));
  const subcommand = input.match(/^\/([a-z0-9-]+)\s+([a-z0-9-]*)$/i);
  if (subcommand && pluginSubcommands[subcommand[1]]) return pluginSubcommands[subcommand[1]].map((name) => `/${subcommand[1]} ${name}`).filter((name) => name.toLowerCase().startsWith(q)).sort();
  const skillPrefix = q.startsWith("/skill ") ? q.slice("/skill ".length) : null;
  if (skillPrefix === null) return commandMatches.sort();
  return skillNames
    .map((name) => `/skill ${name}`)
    .filter((name) => name.toLowerCase().startsWith(q))
    .sort();
}

export function subagentSuggestions(input: string, agentNames: string[] = []): string[] {
  const match = input.match(/^@([a-z0-9-]*)$/i);
  if (!match) return [];
  const query = match[1].toLowerCase();
  return agentNames
    .map((name) => `@${name}`)
    .filter((name) => name.slice(1).toLowerCase().startsWith(query))
    .sort();
}

export function inputSuggestions(input: string, skillNames: string[] = [], customNames: string[] = [], agentNames: string[] = [], pluginSubcommands: Record<string, string[]> = {}): string[] {
  return input.startsWith("@")
    ? subagentSuggestions(input, agentNames)
    : slashSuggestions(input, skillNames, customNames, pluginSubcommands);
}
