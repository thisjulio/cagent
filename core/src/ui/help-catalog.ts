import { commandNames } from "../commands/commands";

export type HelpItem = { name: string; description: string; group: string };

const descriptions: Record<string, string> = {
  "/init": "create project instructions",
  "/preference": "manage saved preferences",
  "/lsp": "inspect and install language servers",
  "/compact": "summarize the conversation to free context",
  "/sessions": "resume a previous session",
  "/session": "resume a previous session",
  "/new": "start a fresh session",
  "/rename": "rename the current session",
  "/tasks": "manage the task list",
  "/model": "switch model",
  "/variant": "show or set the model variant",
  "/help": "browse commands and keyboard shortcuts",
  "/usage": "show token and cost usage",
  "/telemetry": "show session telemetry",
  "/auth.openai": "manage OpenAI credentials",
  "/skill": "load an available skill",
  "/reload-skills": "rescan skill directories",
};

export function getHelpCatalog(
  options: {
    customNames?: string[];
    pluginNames?: string[];
    skillNames?: string[];
    agentNames?: string[];
  } = {},
): HelpItem[] {
  const items: HelpItem[] = commandNames.map((name) => ({
    name,
    description: descriptions[name] ?? "run command",
    group: "Built-in commands",
  }));
  for (const name of options.pluginNames ?? [])
    items.push({
      name: name.startsWith("/") ? name : `/${name}`,
      description: "plugin command",
      group: "Plugin commands",
    });
  for (const name of options.customNames ?? [])
    items.push({
      name: name.startsWith("/") ? name : `/${name}`,
      description: "custom command",
      group: "Custom commands",
    });
  for (const name of options.skillNames ?? [])
    items.push({
      name: `/skill ${name}`,
      description: "load skill",
      group: "Skills",
    });
  for (const name of options.agentNames ?? [])
    items.push({
      name: `@${name}`,
      description: "delegate to subagent",
      group: "Subagents",
    });
  items.push({
    name: "$<command>",
    description: "run a shell command",
    group: "Input",
  });
  items.push({
    name: "@<agent>",
    description: "mention a subagent",
    group: "Input",
  });
  return items;
}

export const helpCommands = getHelpCatalog().map(({ name, description }) => ({
  name,
  description,
}));
export const helpKeys = [
  ["Ctrl+P", "open command palette"],
  ["Ctrl+T", "toggle task panel"],
  ["Enter", "send prompt"],
  ["Esc", "clear typed text / close panel; interrupt a running turn"],
  ["Tab", "cycle command autocomplete"],
  ["Ctrl+C", "clear input, cancel turn, or exit"],
  ["Ctrl+O", "open tool diff viewer"],
  ["Shift+Ctrl+O", "cycle backward through tool calls"],
  ["Ctrl+M", "cycle permission mode"],
  ["y / n / a", "allow / deny / always-allow request"],
  ["↑↓", "navigate prompt history and scroll panels"],
  ["Ctrl+R", "search prompt history for this project"],
  ["PgUp/PgDn", "page scroll"],
  ["Ctrl+U", "delete to line start"],
  ["Ctrl+W", "delete previous word"],
  ["Ctrl+A / Ctrl+E", "jump to start / end"],
  ["Ctrl+Left/Right", "move by word"],
  ["Home / End", "jump to line ends"],
].map(([name, description]) => ({ name, description }));

export function helpDetails(topic: string): string[] {
  const normalized = topic.toLowerCase().trim().replace(/^\/+/, "");
  const item = [...helpCommands, ...helpKeys].find(
    (entry) => entry.name.toLowerCase().replace(/^\/+/, "") === normalized,
  );
  return item
    ? [`${item.name} — ${item.description}`]
    : [
        `unknown topic: '${topic}'`,
        "Use /help to browse available commands and shortcuts.",
        "/help",
      ];
}
