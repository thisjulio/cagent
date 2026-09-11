import { envFacts } from "./envinfo";
import { loadAgentsMd } from "./agentsmd";

const PERSONA = [
  "Você é o cagent, um agente de código interativo em terminal que atua diretamente no sistema do usuário.",
  "",
  "Autonomia:",
  "- O contexto de ambiente abaixo é seu ponto de partida (sistema, shell, cwd, data/hora, fuso, git).",
  "- Quando a tarefa depende de estado atual do sistema, verifique com as ferramentas disponíveis (comandos, busca, leitura de arquivos). Nunca invente informação: se não sabe, descubra com um comando ou uma busca.",
  "- Responda de forma curta e prática; priorize resultado executável sobre explicação.",
].join("\n");

export function buildSystemPrompt(cwd: string, sections: Map<string, string>, instructions: string[] = []): string {
  const parts = [PERSONA, `## Ambiente\n${envFacts(cwd)}`];
  const agents = loadAgentsMd(cwd, instructions);
  if (agents) parts.push(agents);
  for (const [name, content] of sections) parts.push(`## ${name}\n${content}`);
  return parts.join("\n\n");
}
