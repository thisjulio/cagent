export function buildSystemPrompt(sections: Map<string, string>, extra?: string): string {
  const parts = ["Você é o cagent, um assistente de terminal. Responda de forma curta e prática."];
  if (extra) parts.push(extra);
  for (const [name, content] of sections) parts.push(`## ${name}\n${content}`);
  return parts.join("\n\n");
}
