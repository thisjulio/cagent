import yaml from "js-yaml";
import type { SubagentDefinition } from "@cagent/sdk";

export function parseSubagent(text: string): SubagentDefinition {
  const match = text.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/);
  if (!match) throw new Error("missing YAML frontmatter");
  const raw = yaml.load(match[1]);
  if (!raw || typeof raw !== "object") throw new Error("frontmatter must be a YAML object");
  const data = raw as Record<string, unknown>;
  if (typeof data.name !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.name)) throw new Error("invalid subagent name");
  if (typeof data.description !== "string" || !data.description.trim()) throw new Error("subagent description is required");
  const tools = data.tools;
  if (tools !== undefined && (!Array.isArray(tools) || tools.some((tool) => typeof tool !== "string"))) throw new Error("subagent tools must be a string list");
  const instructions = text.slice(match[0].length).trim();
  if (!instructions) throw new Error("subagent instructions are required");
  return { name: data.name, description: data.description.trim(), instructions,
    ...(typeof data.model === "string" ? { model: data.model } : {}),
    ...(Array.isArray(tools) ? { tools: tools as string[] } : {}) };
}