import type { ToolArgs, ToolDefinition } from "@cagent/sdk";
import type { EventBus } from "./events";
import { appendCapped, MAX_TOOL_OUTPUT_CHARS } from "./stream-buffer";

export type ToolAsk = (tool: ToolDefinition, args: ToolArgs) => Promise<boolean>;

export function permission(tool: ToolDefinition, args: ToolArgs, allowlist: string[]): "allow" | "ask" {
  const target = typeof args.command === "string" ? (args.command as string).trim() : JSON.stringify(args);
  // ponytail: prefixes only for now; denylist and allowlist UX belong in Phase 7.
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
    return { output: `user denied execution of ${tool.name}`, isError: true };
  }
  bus.emit("tools/pre", { tool: tool.name, args });
  try {
    const result = await tool.execute(args);
    bus.emit("tools/post", { tool: tool.name, result });
    return { ...result, output: appendCapped("", result.output, MAX_TOOL_OUTPUT_CHARS) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    bus.emit("tools/post", { tool: tool.name, error: msg });
    return { output: `error in tool ${tool.name}: ${msg}`, isError: true };
  }
}
