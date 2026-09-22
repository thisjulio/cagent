import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type {
  HookDefinition,
  HookEvent,
  HookPhase,
  HookResponse,
  Plugin,
  CommandSource,
} from "@cagent/sdk";
import { readHookOutput } from "./hook-output";
import { discoverCommandFiles } from "./command-files";
import { discoverAgentFiles } from "./agent-files";

// Claude Code plugin manifest
type ClaudePluginManifest = {
  name: string;
  version?: string;
  description?: string;
  hooks?: string; // path to hooks config file
  commands?: string | string[]; // path(s) to commands directories
  skills?: string; // path to skills directory
  agents?: string; // path to agents directory
};

type ClaudeHookEntry = {
  matcher?: string;
  hooks?: ClaudeHook[];
};

type ClaudeHook = {
  type: string;
  command: string;
  timeout?: number;
  statusMessage?: string;
};

type ClaudeHooksConfig = {
  hooks?: Record<string, ClaudeHookEntry[]>;
};

// Map Claude hook events to cagent hook phases
const HOOK_PHASE_MAP: Record<string, HookPhase> = {
  SessionStart: "session_start",
  UserPromptSubmit: "user_prompt_submit",
  SubagentStart: "subagent_start",
  PreToolUse: "before_tool",
  PostToolUse: "after_tool",
};

function findPluginDirs(cwd: string): string[] {
  const dirs: string[] = [];
  // Project-level plugins take precedence over user-level
  const projectPlugins = path.join(cwd, ".claude", "plugins");
  if (fs.existsSync(projectPlugins)) {
    dirs.push(projectPlugins);
  }
  // User-level plugins
  const userPlugins = path.join(os.homedir(), ".claude", "plugins");
  if (fs.existsSync(userPlugins)) {
    dirs.push(userPlugins);
  }
  return dirs;
}

function loadManifest(
  pluginDir: string,
  pluginName: string,
  diagnostics: import("@cagent/sdk").PluginDiagnostics,
): ClaudePluginManifest | null {
  const manifestPath = path.join(pluginDir, ".claude-plugin", "plugin.json");
  if (!fs.existsSync(manifestPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (e) {
    diagnostics.report({
      level: "error",
      code: "manifest-parse-error",
      message: `Failed to parse manifest for ${pluginName}: ${e}`,
    });
    return null;
  }
}

function loadHooksConfig(
  pluginDir: string,
  manifest: ClaudePluginManifest,
  diagnostics: import("@cagent/sdk").PluginDiagnostics,
): ClaudeHooksConfig | null {
  if (!manifest.hooks) return null;
  const hooksPath = path.join(pluginDir, manifest.hooks);
  if (!fs.existsSync(hooksPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(hooksPath, "utf8"));
  } catch (e) {
    diagnostics.report({
      level: "error",
      code: "hooks-parse-error",
      message: `Failed to parse hooks config for ${manifest.name}: ${e}`,
    });
    return null;
  }
}

function expandVars(command: string, vars: Record<string, string>): string {
  return command.replace(/\$\{(\w+)\}/g, (match, name) => {
    return vars[name] ?? match;
  });
}

function matches(matcher: string | undefined, tool: string): boolean {
  if (!matcher || matcher === "*") return true;
  try {
    return new RegExp(matcher).test(tool);
  } catch {
    return false;
  }
}

const register: Plugin = (ctx) => {
  const cwd = process.cwd();
  const pluginDirs = findPluginDirs(cwd);
  const seen = new Set<string>();

  for (const pluginDir of pluginDirs) {
    const entries = fs.readdirSync(pluginDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const fullPluginDir = path.join(pluginDir, entry.name);
      const manifest = loadManifest(fullPluginDir, entry.name, ctx.diagnostics);
      if (!manifest) continue;
      if (seen.has(manifest.name)) continue;
      seen.add(manifest.name);

      // Load and register hooks
      const hooksConfig = loadHooksConfig(
        fullPluginDir,
        manifest,
        ctx.diagnostics,
      );
      if (hooksConfig?.hooks) {
        for (const [claudeEvent, rules] of Object.entries(hooksConfig.hooks)) {
          const phase = HOOK_PHASE_MAP[claudeEvent];
          if (!phase) continue;

          for (const [ruleIndex, rule] of rules.entries()) {
            for (const [hookIndex, hook] of (rule.hooks ?? []).entries()) {
              const definition: HookDefinition = {
                name: `claude-plugin-${manifest.name}-${claudeEvent}-${ruleIndex}-${hookIndex}`,
                phase,
                handle: async (
                  event: HookEvent,
                ): Promise<HookResponse | undefined> => {
                  // For tool hooks, check matcher
                  if (phase === "before_tool" || phase === "after_tool") {
                    if (!matches(rule.matcher, event.tool ?? ""))
                      return undefined;
                  }

                  // Expand variables
                  const vars: Record<string, string> = {
                    CLAUDE_PLUGIN_ROOT: fullPluginDir,
                    PLUGIN_ROOT: fullPluginDir,
                    CWD: cwd,
                    HOME: os.homedir(),
                  };
                  const expanded = expandVars(hook.command, vars);

                  // Execute hook command with timeout
                  const timeoutMs = (hook.timeout ?? 5) * 1000;
                  let child;
                  try {
                    child = Bun.spawn(["sh", "-c", expanded], {
                      cwd,
                      env: { ...process.env, ...vars },
                      stdin: "pipe",
                      stdout: "pipe",
                      stderr: "pipe",
                    });
                  } catch (e) {
                    return undefined;
                  }

                  // Build input JSON for the hook
                  const input = {
                    cwd,
                    tool_name: event.tool,
                    tool_input: event.args,
                    tool_output: event.result,
                    error: event.error,
                    prompt: event.prompt,
                    subagent: event.subagent,
                    task: event.task,
                  };
                  child.stdin.write(JSON.stringify(input));
                  child.stdin.end();

                  let timer: ReturnType<typeof setTimeout> | null = null;
                  const timeoutPromise = new Promise<{ timedOut: true }>(
                    (resolve) =>
                      (timer = setTimeout(() => {
                        child.kill();
                        resolve({ timedOut: true });
                      }, timeoutMs)),
                  );
                  const exitPromise = child.exited.then((code) => ({
                    timedOut: false,
                    code,
                  }));
                  const outputPromise = readHookOutput(child.stdout);
                  void readHookOutput(child.stderr);
                  const result = await Promise.race([
                    exitPromise,
                    timeoutPromise,
                  ]);
                  if (timer) clearTimeout(timer);
                  if (result.timedOut) {
                    await Promise.allSettled([exitPromise, outputPromise]);
                    return undefined;
                  }

                  // Check exit code
                  if ((result as { code: number }).code !== 0) {
                    await outputPromise;
                    return undefined;
                  }

                  const output = (await outputPromise).trim();

                  if (!output) return undefined;
                  try {
                    const parsed = JSON.parse(output);
                    if (parsed.decision === "ask")
                      return { action: "ask", reason: parsed.reason };
                    if (parsed.decision === "deny")
                      return { action: "deny", reason: parsed.reason };
                    if (parsed.continue === false)
                      return { action: "deny", reason: parsed.message };
                    return { action: "allow", message: parsed.message };
                  } catch {
                    // Non-JSON output: inject as context message
                    return { action: "allow", message: output };
                  }
                },
              };
              ctx.registerHook(definition);
            }
          }
        }
      }

      const configuredCommands = manifest.commands
        ? (Array.isArray(manifest.commands)
            ? manifest.commands
            : [manifest.commands]
          ).map((commandsPath) => path.join(fullPluginDir, commandsPath))
        : [];
      const commandDirs = [
        ...configuredCommands,
        path.join(fullPluginDir, "commands"),
      ].filter((directory, index, all) => all.indexOf(directory) === index);
      ctx.registerCommandSource({
        discover: () =>
          commandDirs.flatMap((commandsDir) =>
            discoverCommandFiles(commandsDir),
          ),
      });

      const agentsDir = path.join(fullPluginDir, manifest.agents ?? "agents");
      if (fs.existsSync(agentsDir)) {
        for (const agent of discoverAgentFiles(agentsDir)) {
          ctx.registerSubagent(agent);
        }
      }

      // Discover and register skills
      const skillsDir = path.join(fullPluginDir, manifest.skills ?? "skills");
      if (fs.existsSync(skillsDir)) {
        const skillSource: import("@cagent/sdk").SkillSource = {
          discover: () => [skillsDir],
        };
        ctx.registerSkillSource(skillSource);
      }
    }
  }
};

export default register;
