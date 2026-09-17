import type { SubagentDefinition } from "@cagent/sdk";
import type { SubagentCatalog, SubagentRecord } from "./types";

const GENERAL_INSTRUCTIONS = `You are cagent's general-purpose subagent.

Act as a general assistant and execute the task received from the main agent. Analyze
the context provided before responding, and use available tools when they are necessary.
Respond objectively with concrete findings or results. Do not claim to have performed
actions you did not perform. Clearly report any limitations, missing context, or
ambiguities that affect the result.`;

const BUILTIN_SUBAGENTS: SubagentDefinition[] = [{
  name: "general",
  description: "Handles general-purpose tasks delegated by the main agent.",
  instructions: GENERAL_INSTRUCTIONS,
}];

export function addBuiltinSubagents(catalog: SubagentCatalog): SubagentCatalog {
  const agents = [...catalog.agents];
  const byName = new Map(catalog.byName);
  for (const definition of BUILTIN_SUBAGENTS) {
    if (byName.has(definition.name)) continue;
    const record: SubagentRecord = { ...definition, source: "builtin:cagent" };
    agents.push(record);
    byName.set(record.name, record);
  }
  return { agents, byName };
}