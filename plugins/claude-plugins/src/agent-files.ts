import fs from "node:fs";
import path from "node:path";
import type { SubagentDefinition } from "@cagent/sdk";

function readAgent(file: string): SubagentDefinition {
  const text = fs.readFileSync(file, "utf8");
  const match = text.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/);
  if (!match) throw new Error(`Claude agent requires frontmatter: ${file}`);

  const fields = new Map<string, string>();
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^([A-Za-z][\w-]*)\s*:\s*(.*)$/);
    if (field)
      fields.set(field[1], field[2].trim().replace(/^["']|["']$/g, ""));
  }
  const name = fields.get("name");
  const description = fields.get("description");
  if (!name || !description)
    throw new Error(`Claude agent requires name and description: ${file}`);

  return {
    name,
    description,
    instructions: text.slice(match[0].length).trim(),
    ...(fields.get("model") ? { model: fields.get("model") } : {}),
    ...(fields.get("tools")
      ? {
          tools: fields
            .get("tools")!
            .split(",")
            .map((tool) => tool.trim()),
        }
      : {}),
  };
}

export function discoverAgentFiles(directory: string): SubagentDefinition[] {
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .flatMap((entry) => {
      try {
        return [readAgent(path.join(directory, entry.name))];
      } catch {
        return [];
      }
    });
}
