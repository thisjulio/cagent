import { commandNames } from "./commands";

// ponytail: alphabetical order (not Object.keys) keeps suggestions predictable - "/session" before "/sessions".
export function slashSuggestions(input: string): string[] {
  if (!input.startsWith("/")) return [];
  const q = input.toLowerCase();
  return commandNames.filter((n) => n.startsWith(q)).sort();
}
