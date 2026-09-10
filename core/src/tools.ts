import type { ToolArgs, ToolDefinition } from "@cagent/sdk";
import type { EventBus } from "./events";

export type ToolAsk = (tool: ToolDefinition, args: ToolArgs) => Promise<boolean>;

export function permission(tool: ToolDefinition, args: ToolArgs, allowlist: string[]): "allow" | "ask" {
  const target = typeof args.command === "string" ? (args.command as string).trim() : JSON.stringify(args);
  // ponytail: apenas prefixos da allowlist; denylist e UX de allowlist entram na Fase 7
  return allowlist.some((p) => target.startsWith(p)) ? "allow" : "ask";
}

export async function runToolPipeline(
  tool: ToolDefinition,
  args: ToolArgs,
  allowlist: string[],
  ask: ToolAsk,
  bus: EventBus,
): Promise<{ output: string; isError?: boolean }> {
  if (permission(tool, args, allowlist) === "ask" && !(await ask(tool, args))) {
    bus.emit("tools/denied", { tool: tool.name, args });
    return { output: `usuário negou a execução de ${tool.name}`, isError: true };
  }
  bus.emit("tools/pre", { tool: tool.name, args });
  try {
    const result = await tool.execute(args);
    bus.emit("tools/post", { tool: tool.name, result });
    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    bus.emit("tools/post", { tool: tool.name, error: msg });
    return { output: `erro na tool ${tool.name}: ${msg}`, isError: true };
  }
}
