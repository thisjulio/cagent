import { noopObservability, trace, type HookResponse, type Observability, type ToolArgs, type ToolDefinition } from "@cagent/sdk";
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
  hooks?: { run(event: import("@cagent/sdk").HookEvent): Promise<HookResponse[]> },
  signal?: AbortSignal,
  observability: Observability = noopObservability,
): Promise<import("@cagent/sdk").ToolResult> {
  const before = await hooks?.run({ phase: "before_tool", tool: tool.name, args }) ?? [];
  const blocking = before.find((response) => response.action === "deny" || response.action === "ask");
  if (blocking) {
    if (blocking.action === "ask" && await ask(tool, args)) {
      // Approval continues through the regular permission check below.
    } else {
      bus.emit("tools/denied", { tool: tool.name, args, reason: blocking.reason });
      return { output: blocking.reason ?? `hook denied execution of ${tool.name}`, isError: true };
    }
  }
  if (permission(tool, args, allowlist) === "ask" && !(await ask(tool, args))) {
    bus.emit("tools/denied", { tool: tool.name, args });
    return { output: `user denied execution of ${tool.name}`, isError: true };
  }
  bus.emit("tools/pre", { tool: tool.name, args });
  try {
    const result = await trace(observability, "tool.execute", () => tool.execute({ ...args, signal }), { "tool.name": tool.name });
    bus.emit("tools/post", { tool: tool.name, result });
    await hooks?.run({ phase: "after_tool", tool: tool.name, args, result });
    return { ...result, output: appendCapped("", result.output, MAX_TOOL_OUTPUT_CHARS) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    bus.emit("tools/post", { tool: tool.name, error: msg });
    await hooks?.run({ phase: "after_tool", tool: tool.name, args, error: msg });
    return { output: `error in tool ${tool.name}: ${msg}`, isError: true };
  }
}
