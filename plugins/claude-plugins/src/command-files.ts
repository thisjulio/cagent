import fs from "node:fs";
import path from "node:path";
import type { CommandDefinition } from "@cagent/sdk";

function readTomlCommand(file: string): CommandDefinition {
  const text = fs.readFileSync(file, "utf8");
  const description = text.match(/^description\s*=\s*"([^"]*)"\s*$/m)?.[1];
  const prompt = text.match(/^prompt\s*=\s*"([\s\S]*)"\s*$/m)?.[1];
  if (!prompt) throw new Error(`Claude command requires prompt: ${file}`);
  return {
    name: path.basename(file, ".toml"),
    file,
    content: `${description ? `${description}\n\n` : ""}${prompt}`,
  };
}

export function discoverCommandFiles(directory: string): CommandDefinition[] {
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        (entry.name.endsWith(".md") || entry.name.endsWith(".toml")),
    )
    .flatMap((entry) => {
      const file = path.join(directory, entry.name);
      try {
        if (entry.name.endsWith(".toml")) return [readTomlCommand(file)];
        return [
          {
            name: entry.name.slice(0, -3),
            file,
            content: fs.readFileSync(file, "utf8").trim(),
          },
        ];
      } catch {
        return [];
      }
    })
    .filter((command) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(command.name));
}
