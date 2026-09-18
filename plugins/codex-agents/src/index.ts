import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import type { Plugin, SubagentDefinition } from "@cagent/sdk";

function parse(file: string): SubagentDefinition {
  const text = fs.readFileSync(file, "utf8");
  const match = text.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/);
  if (!match) throw new Error(`invalid Codex agent: ${file}`);
  const data = yaml.load(match[1]) as Record<string, unknown>;
  if (typeof data?.name !== "string" || typeof data?.description !== "string")
    throw new Error(`Codex agent requires name and description: ${file}`);
  return {
    name: data.name,
    description: data.description,
    instructions: text.slice(match[0].length).trim(),
    ...(typeof data.model === "string" ? { model: data.model } : {}),
    ...(Array.isArray(data.tools)
      ? { tools: data.tools.filter((v): v is string => typeof v === "string") }
      : {}),
  };
}

const register: Plugin = (ctx) => {
  const dir = path.resolve(String(ctx.config.root ?? ".codex/agents"));
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".md"))
      ctx.registerSubagent(parse(path.join(dir, entry.name)));
  }
};
export default register;
