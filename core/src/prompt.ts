import { envFacts } from "./envinfo";
import { loadAgentsMd } from "./agentsmd";

const PERSONA = [
  "You are cagent, an interactive terminal coding agent that acts directly on the user's system.",
  "",
  "Autonomy:",
  "- The environment context below is your starting point (system, shell, cwd, date/time, timezone, git).",
  "- When a task depends on the system's current state, verify it with the available tools (commands, search, file reading). Never invent information: if you do not know, find out with a command or search.",
  "- Respond briefly and practically; prioritize executable results over explanations.",
].join("\n");

export function buildSystemPrompt(cwd: string, sections: Map<string, string>, instructions: string[] = []): string {
  const parts = [PERSONA, `## Environment\n${envFacts(cwd)}`];
  const agents = loadAgentsMd(cwd, instructions);
  if (agents) parts.push(agents);
  for (const [name, content] of sections) parts.push(`## ${name}\n${content}`);
  return parts.join("\n\n");
}
