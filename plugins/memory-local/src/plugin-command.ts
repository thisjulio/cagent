import type { PluginCommand, PluginCommandContext } from "@cagent/sdk";
import type { ToolDefinition } from "@cagent/sdk";

const ROUTES: Record<string, { tool: string; required?: string[] }> = {
  add: { tool: "memory_add", required: ["content"] }, list: { tool: "memory_list" }, search: { tool: "memory_search", required: ["query"] },
  show: { tool: "memory_show", required: ["id"] }, edit: { tool: "memory_edit", required: ["id", "content"] }, approve: { tool: "memory_approve", required: ["id"] },
  ignore: { tool: "memory_ignore", required: ["id"] }, archive: { tool: "memory_archive", required: ["id"] }, forget: { tool: "memory_forget", required: ["id"] },
  pending: { tool: "memory_pending" }, status: { tool: "memory_status" }, diagnostics: { tool: "memory_diagnostics" }, retrieval: { tool: "memory_retrieval", required: ["enabled"] }, capture: { tool: "memory_capture", required: ["enabled"] },
};

export function createMemoryCommand(tools: ToolDefinition[]): PluginCommand {
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  return { name: "memory", description: "Manage local project and user memories.", execute: async (context) => executeMemoryCommand(context, byName) };
}

async function executeMemoryCommand(context: PluginCommandContext, tools: Map<string, ToolDefinition>): Promise<string> {
  const [subcommand = "status", ...positional] = context.arguments.trim().split(/\s+/).filter(Boolean);
  const route = ROUTES[subcommand];
  if (!route) return `Usage: /memory ${Object.keys(ROUTES).join("|")}`;
  const args: Record<string, unknown> = { ...context.values };
  if (subcommand === "add") args.content = positional.join(" ");
  if (subcommand === "search") args.query = positional.join(" ");
  if (["show", "edit", "approve", "ignore", "archive", "forget"].includes(subcommand)) args.id = positional[0];
  if (subcommand === "edit") args.content = positional.slice(1).join(" ");
  if (subcommand === "retrieval" || subcommand === "capture") args.enabled = positional[0] === "on" || args.enabled === true;
  const missing = route.required?.filter((key) => args[key] === undefined || args[key] === "") ?? [];
  if (missing.length) return `Usage error: missing ${missing.join(", ")}`;
  const tool = tools.get(route.tool);
  if (!tool) return `Memory tool unavailable: ${route.tool}`;
  return (await tool.execute(args)).output;
}