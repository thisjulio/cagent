import { commandNames } from "./commands";

// ponytail: alphabetical order (not Object.keys) keeps suggestions predictable - "/session" before "/sessions".
export function slashSuggestions(input: string, skillNames: string[] = [], customNames: string[] = []): string[] {
  if (!input.startsWith("/")) return [];
  const q = input.toLowerCase();
  const commandMatches = [...commandNames, ...customNames.map((name) => `/${name}`)].filter((n) => n.startsWith(q));
  const skillPrefix = q.startsWith("/skill ") ? q.slice("/skill ".length) : null;
  if (skillPrefix === null) return commandMatches.sort();
  return skillNames
    .map((name) => `/skill ${name}`)
    .filter((name) => name.toLowerCase().startsWith(q))
    .sort();
}
