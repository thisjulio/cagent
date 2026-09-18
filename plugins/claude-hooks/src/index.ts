import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
  HookDefinition,
  HookEvent,
  HookPhase,
  HookResponse,
  Plugin,
} from "@cagent/sdk";
import { expandCommand } from "./expand-command";

type ClaudeHook = { type: "command"; command: string };
type ClaudeRule = { matcher?: string; hooks?: ClaudeHook[] };
type ClaudeSettings = { hooks?: Record<string, ClaudeRule[]> };

const TOOL_EVENT_MAP: Record<string, HookPhase> = {
  PreToolUse: "before_tool",
  PostToolUse: "after_tool",
};

const NON_TOOL_EVENT_MAP: Record<string, HookPhase> = {
  SessionStart: "session_start",
  UserPromptSubmit: "user_prompt_submit",
  SubagentStart: "subagent_start",
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

function buildInput(event: HookEvent, cwd: string): Record<string, unknown> {
  const input: Record<string, unknown> = { cwd };
  if (event.phase === "before_tool" || event.phase === "after_tool") {
    input.tool_name = claudeToolName(event.tool ?? "");
    input.tool_input = event.args;
    input.tool_output = event.result;
    input.error = event.error;
  }
  if (event.phase === "user_prompt_submit") {
    input.prompt = event.prompt;
  }
  if (event.phase === "subagent_start") {
    input.subagent = event.subagent;
    input.task = event.task;
  }
  return input;
}

function hookEnv(cwd: string): Record<string, string> {
  return {
    ...process.env,
    CWD: cwd,
  };
}

async function execute(
  command: string,
  event: HookEvent,
  cwd: string,
): Promise<HookResponse | undefined> {
  const expanded = expandCommand(command, cwd);
  const child = Bun.spawn(["sh", "-c", expanded], {
    cwd,
    env: hookEnv(cwd),
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  child.stdin.write(JSON.stringify(buildInput(event, cwd)));
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
  for (const [claudeEvent, phase] of Object.entries(TOOL_EVENT_MAP)) {
    for (const [index, rule] of (
      settings.hooks?.[claudeEvent] ?? []
    ).entries()) {
      for (const [hookIndex, hook] of (rule.hooks ?? []).entries()) {
        const definition: HookDefinition = {
          name: `claude-${claudeEvent}-${index}-${hookIndex}`,
          phase,
          handle: async (event) => {
            if (!matches(rule.matcher, claudeToolName(event.tool ?? "")))
              return undefined;
            return execute(hook.command, event, process.cwd());
          },
        };
        ctx.registerHook(definition);
      }
    }
  }
  for (const [claudeEvent, phase] of Object.entries(NON_TOOL_EVENT_MAP)) {
    for (const [index, rule] of (
      settings.hooks?.[claudeEvent] ?? []
    ).entries()) {
      for (const [hookIndex, hook] of (rule.hooks ?? []).entries()) {
        const definition: HookDefinition = {
          name: `claude-${claudeEvent}-${index}-${hookIndex}`,
          phase,
          handle: async (event) => execute(hook.command, event, process.cwd()),
        };
        ctx.registerHook(definition);
      }
    }
  }
};

export default register;
