import {
  noopObservability,
  trace,
  type HookResponse,
  type Observability,
  type ToolArgs,
  type ToolDefinition,
} from "@cagent/sdk";
import type { EventBus } from "./events";
import { appendCapped, MAX_TOOL_OUTPUT_CHARS } from "./stream-buffer";
import { ensureToolTitle } from "./tool-title";

export type ToolAsk = (
  tool: ToolDefinition,
  args: ToolArgs,
) => Promise<boolean>;

export function permission(
  tool: ToolDefinition,
  args: ToolArgs,
  allowlist: string[],
  readOnly = false,
): "allow" | "ask" | "deny" {
  if (readOnly && !tool.readOnly) return "deny";
  if (readOnly) return "allow";
  const target =
    typeof args.command === "string"
      ? (args.command as string).trim()
      : JSON.stringify(args);
  const shellCommand = typeof args.command === "string";
  return allowlist.includes(target) &&
    !(shellCommand && hasShellControlSyntax(target))
    ? "allow"
    : "ask";
}

function hasShellControlSyntax(command: string): boolean {
  let quote: "'" | '"' | undefined;
  let escaped = false;
  for (let i = 0; i < command.length; i++) {
    const char = command[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "`" || (char === "$" && quote !== "'")) return true;
    if (char === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = undefined;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (";&|<>\n\r".includes(char)) return true;
  }
  return quote !== undefined || escaped;
}

export async function runToolPipeline(
  tool: ToolDefinition,
  args: ToolArgs,
  allowlist: string[],
  ask: ToolAsk,
  bus: EventBus,
  hooks?: {
    run(event: import("@cagent/sdk").HookEvent): Promise<HookResponse[]>;
  },
  signal?: AbortSignal,
  observability: Observability = noopObservability,
  title?: string,
  readOnly = false,
): Promise<import("@cagent/sdk").ToolResult> {
  const toolTitle = ensureToolTitle(title, tool.name);
  const decision = permission(tool, args, allowlist, readOnly);
  if (decision === "deny") {
    const reason = `${tool.name} is disabled in read-only mode`;
    bus.emit("tools/denied", {
      tool: tool.name,
      args,
      title: toolTitle,
      reason,
    });
    return { output: reason, isError: true };
  }
  const before =
    (await hooks?.run({ phase: "before_tool", tool: tool.name, args })) ?? [];
  const blocking = before.find(
    (response) => response.action === "deny" || response.action === "ask",
  );
  if (blocking) {
    if (blocking.action === "ask" && (await ask(tool, args))) {
      // Approval continues through the regular permission check below.
    } else {
      bus.emit("tools/denied", {
        tool: tool.name,
        args,
        title: toolTitle,
        reason: blocking.reason,
      });
      return {
        output: blocking.reason ?? `hook denied execution of ${tool.name}`,
        isError: true,
      };
    }
  }
  if (decision !== "allow" && !(await ask(tool, args))) {
    const reason = `user denied execution of ${tool.name}`;
    bus.emit("tools/denied", {
      tool: tool.name,
      args,
      title: toolTitle,
      reason,
    });
    return { output: reason, isError: true };
  }
  bus.emit("tools/pre", { tool: tool.name, args, title: toolTitle });
  try {
    const result = await trace(
      observability,
      "tool.execute",
      () => tool.execute({ ...args, signal }),
      { "tool.name": tool.name },
    );
    bus.emit("tools/post", { tool: tool.name, result });
    await hooks?.run({ phase: "after_tool", tool: tool.name, args, result });
    return {
      ...result,
      output: appendCapped("", result.output, MAX_TOOL_OUTPUT_CHARS),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    bus.emit("tools/post", { tool: tool.name, error: msg });
    await hooks?.run({
      phase: "after_tool",
      tool: tool.name,
      args,
      error: msg,
    });
    return { output: `error in tool ${tool.name}: ${msg}`, isError: true };
  }
}
