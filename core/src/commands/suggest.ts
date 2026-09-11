import { commandNames } from "./commands";

// ponytail: ordem alfabética (não Object.keys) para sugestão previsível — "/session" antes de "/sessions"
export function slashSuggestions(input: string): string[] {
  if (!input.startsWith("/")) return [];
  const q = input.toLowerCase();
  return commandNames.filter((n) => n.startsWith(q)).sort();
}
