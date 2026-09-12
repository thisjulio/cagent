import fs from "node:fs";
import path from "node:path";
import type { CommandCatalog, CustomCommand } from "./types";
import type { CommandSource } from "@cagent/sdk";

export function createCommandSource(root = ".cagent/commands"): CommandSource {
  return {
    discover(cwd) {
      const directory = path.resolve(cwd, root);
      if (!fs.existsSync(directory)) return [];
      return fs.readdirSync(directory, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
        .map((entry) => {
          const name = entry.name.slice(0, -3);
          const file = path.join(directory, entry.name);
          return { name, file, content: fs.readFileSync(file, "utf8").trim() };
        })
        .filter((command) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(command.name));
    },
  };
}

export function discoverCommands(cwd: string, sources: CommandSource[]): CommandCatalog {
  const byName = new Map<string, CustomCommand>();
  for (const source of sources) for (const command of source.discover(cwd))
    if (!byName.has(command.name)) byName.set(command.name, command);
  return { commands: [...byName.values()], byName };
}

export function expandCommand(command: CustomCommand, args: string): string {
  return command.content
    .replaceAll("$ARGUMENTS", args)
    .replaceAll("{{args}}", args)
    .trim();
}