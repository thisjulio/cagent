import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
  HookDefinition,
  HookEvent,
  HookResponse,
  Plugin,
} from "@cagent/sdk";

type ClaudeHook = { type: "command"; command: string };
type ClaudeRule = { matcher?: string; hooks?: ClaudeHook[] };
type ClaudeSettings = { hooks?: Record<string, ClaudeRule[]> };

const eventMap: Record<string, "before_tool" | "after_tool"> = {
  PreToolUse: "before_tool",
  PostToolUse: "after_tool",
};

function readSettings(cwd: string): ClaudeSettings {
  const files = [
    path.join(os.homedir(), ".claude", "settings.json"),
    path.join(cwd, ".claude", "settings.json"),
  ];
  return files.reduce<ClaudeSettings>((merged, file) => {
    if (!fs.existsSync(file)) return merged;
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as ClaudeSettings;
    for (const [event, rules] of Object.entries(parsed.hooks ?? {})) {
      merged.hooks ??= {};
      merged.hooks[event] = [...(merged.hooks[event] ?? []), ...(rules ?? [])];
    }
    return merged;
  }, {});
}

function matches(matcher: string | undefined, tool: string): boolean {
  if (!matcher || matcher === "*") return true;
  return new RegExp(`^(?:${matcher})$`).test(tool);
}

function claudeToolName(tool: string): string {
  return tool === "bash"
    ? "Bash"
    : tool === "edit_file" || tool === "write_file"
      ? "Edit"
      : tool;
}

async function execute(
  command: string,
  event: HookEvent,
  cwd: string,
): Promise<HookResponse | undefined> {
  const child = Bun.spawn(["sh", "-c", command], {
    cwd,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  child.stdin.write(
    JSON.stringify({
      tool_name: claudeToolName(event.tool),
      tool_input: event.args,
      tool_output: event.result,
      error: event.error,
      cwd,
    }),
  );
  child.stdin.end();
  const output = (await new Response(child.stdout).text()).trim();
  await child.exited;
  if (!output) return undefined;
  try {
    const parsed = JSON.parse(output) as {
      decision?: string;
      reason?: string;
      continue?: boolean;
      message?: string;
    };
    if (parsed.decision === "ask")
      return { action: "ask", reason: parsed.reason };
    if (parsed.decision === "deny")
      return { action: "deny", reason: parsed.reason };
    if (parsed.continue === false)
      return { action: "deny", reason: parsed.message };
    return { action: "allow", message: parsed.message };
  } catch {
    return undefined;
  }
}

const register: Plugin = (ctx) => {
  const settings = readSettings(process.cwd());
  for (const [claudeEvent, phase] of Object.entries(eventMap)) {
    for (const [index, rule] of (
      settings.hooks?.[claudeEvent] ?? []
    ).entries()) {
      for (const [hookIndex, hook] of (rule.hooks ?? []).entries()) {
        const definition: HookDefinition = {
          name: `claude-${claudeEvent}-${index}-${hookIndex}`,
          phase,
          handle: async (event) => {
            if (!matches(rule.matcher, claudeToolName(event.tool)))
              return undefined;
            return execute(hook.command, event, process.cwd());
          },
        };
        ctx.registerHook(definition);
      }
    }
  }
};

export default register;
