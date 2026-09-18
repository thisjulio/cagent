export type SubagentMention = { name: string; task: string };

export function parseSubagentMention(
  text: string,
): SubagentMention | undefined {
  const match = text.match(/^@([a-z0-9]+(?:-[a-z0-9]+)*)\s+(.+)$/s);
  if (!match) return undefined;
  return { name: match[1], task: match[2].trim() };
}
