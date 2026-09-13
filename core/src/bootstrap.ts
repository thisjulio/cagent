import React from "react";
import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import type { Observability, Plugin } from "@cagent/sdk";
import { loadConfig, type AppConfig } from "./config";
import { loadPlugins } from "./loader";
import { EventBus } from "./events";
import { Registry } from "./registry";
import { buildSystemPrompt } from "./prompt";
import { splitRoute } from "./route";
import { Controller } from "./controller/controller";
import { App } from "./ui/components/App";
import { discoverSkills } from "./skills/discovery";
import { createReadSkillTool, readSkill } from "./skills/read-tool";
import { addBuiltinSkills } from "./skills/builtin";
import { applySkillArguments } from "./skills/arguments";
import { createTaskTool } from "./tasks/task-tool";
import { createCommandSource, discoverCommands } from "./commands/discovery";
import { discoverSubagents } from "./subagents/discovery";
import { createSubagentExecutor } from "./subagents/executor";
import { createSubagentTool } from "./subagents/tool";
import type { ToolAsk } from "./tools";
import type { CliOptions } from "./cli-args";
import fs from "node:fs";
import path from "node:path";
import { createLocalObservability } from "./local-telemetry";

export async function resolveRoute(config: AppConfig, registry: Registry): Promise<string> {
  if (config.model) {
    const [prov, model] = splitRoute(config.model);
    const adapter = registry.provider(prov);
    if (!adapter) throw new Error(`provider not found: ${prov}`);
    const models = await adapter.list_models();
    if (!models.includes(model)) throw new Error(`model ${model} does not exist in provider ${prov} (available: ${models.join(", ")})`);
    return config.model;
  }
  const first = registry.llmRoute();
  if (!first) throw new Error("(no provider - nothing to do)");
  const models = await registry.provider(first)!.list_models();
  if (!models.length) throw new Error("(no provider - nothing to do)");
  return `${first}/${models[0]}`;
}

function contextFiles(options: CliOptions): string {
  const paths = [...options.files, ...options.directories];
  if (!paths.length) return "";
  const root = path.resolve(process.cwd());
  return paths.map((entry) => {
    const target = path.resolve(root, entry);
    if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
      throw new Error(`context path is outside the workspace: ${entry}`);
    }
    if (!fs.existsSync(target)) throw new Error(`context path does not exist: ${entry}`);
    const stat = fs.statSync(target);
    if (stat.isDirectory()) return `[context directory] ${path.relative(root, target)}`;
    const content = fs.readFileSync(target, "utf8");
    return `[context file: ${path.relative(root, target)}]\n${content}`;
  }).join("\n\n");
}

export interface BootstrapOptions {
  defaultPlugins?: AppConfig["plugins"];
  pluginLoaders?: Record<string, Plugin>;
  observability?: Observability;
  cli?: CliOptions;
  headless?: CliOptions;
}

export async function bootstrap(options: BootstrapOptions = {}): Promise<void> {
  const started = performance.now();
  const loaded = loadConfig(process.cwd());
  const telemetry = options.observability ?? createLocalObservability(
    (options.headless?.telemetry ?? options.cli?.telemetry ?? loaded.observability?.enabled) === true,
    loaded.observability?.file,
  );
  telemetry.recordEvent("app.start", { interactive: !options.headless });
  const config = loaded.plugins.length || !options.defaultPlugins ? loaded : { ...loaded, plugins: options.defaultPlugins };
  if (options.headless?.model) config.model = options.headless.model;
  if (options.headless?.logLevel) config.log_level = options.headless.logLevel;
  const telemetryOverride = options.headless?.telemetry ?? options.cli?.telemetry;
  if (telemetryOverride !== undefined) {
    config.observability = { ...config.observability, enabled: telemetryOverride };
  }
  const registry = new Registry();
  const bus = new EventBus();
  const loadedPlugins = await loadPlugins(config, registry, bus, {
    loaders: options.pluginLoaders,
    observability: telemetry,
  });
  for (const agent of discoverSubagents(process.cwd()).agents) registry.registerSubagent(agent);
  const skills = config.skills?.enabled === false ? undefined : addBuiltinSkills(
    discoverSkills(process.cwd(), config.skills?.roots),
  );
  const commands = discoverCommands(process.cwd(), [createCommandSource(), ...loadedPlugins.commandSources]);
  const reloadSkills = skills ? () => {
    const refreshed = addBuiltinSkills(discoverSkills(process.cwd(), config.skills?.roots));
    skills.skills = refreshed.skills;
    skills.byName = refreshed.byName;
  } : undefined;
  if (skills) registry.registerTool(createReadSkillTool(skills));
  let route: string;
  try {
    route = await resolveRoute(config, registry);
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
  const adapter = registry.provider(splitRoute(route)[0])!;
  telemetry.recordEvent("route.resolved", { "model.route": route });
  const contextWindow = await adapter.context_window?.(splitRoute(route)[1]);
  let ask: ToolAsk = async () => true;
  const executeSubagent = createSubagentExecutor({
    find: (name) => registry.subagent(name),
    registry,
    model: route,
    tools: registry.tools(),
    allowlist: config.allowlist,
    ask: (...args) => ask(...args),
    bus,
  });
  const c = new Controller({
    config,
    registry,
    bus,
    adapter,
    model: route,
    contextWindow,
    sessionId: options.headless?.session,
    maxTurns: options.headless?.maxTurns,
    maxToolCalls: options.headless?.maxToolCalls,
    systemPrompt: buildSystemPrompt(process.cwd(), loadedPlugins.promptSections, config.instructions, skills),
    reloadSkills,
    invokeSkill: async (name, args) => {
      const record = skills?.byName.get(name);
      if (!record || record.metadata.userInvocable === false) return undefined;
      const content = await readSkill(skills!, name);
      if (content === undefined) return undefined;
      return { content: applySkillArguments(content, args), directory: record.directory };
    },
    skillNames: () => [...(skills?.byName.keys() ?? [])]
      .filter((name) => skills?.byName.get(name)?.metadata.userInvocable !== false),
    commands: commands.byName,
    invokeSubagent: registry.subagents().length ? executeSubagent : undefined,
    observability: telemetry,
  });
  telemetry.recordMetric("app.startup_ms", performance.now() - started, { "plugin.count": loadedPlugins.commandSources.length });
  ask = c.ask;
  if (registry.subagents().length) {
    registry.registerTool(createSubagentTool(
      () => registry.subagents().map((agent) => agent.name),
      executeSubagent,
    ));
  }
  registry.registerTool(createTaskTool((operation, args) => c.updateTasks(operation, args)));
  bus.on("tools/pre", (p) => c.onToolPre(p));
  bus.on("tools/post", (p) => c.onToolPost(p));
  bus.on("tools/denied", (p) => c.onToolDenied(p));
  bus.on("tools/stdout", (p) => c.onToolStream(p));
  bus.on("tools/stderr", (p) => c.onToolStream(p, "[stderr] "));
  if (options.headless) {
    await runHeadless(c, options.headless);
    return;
  }
  const renderer = await createCliRenderer({ exitOnCtrlC: false });
  createRoot(renderer).render(React.createElement(App, { c }));
}

async function runHeadless(c: Controller, options: CliOptions): Promise<void> {
  if (!options.prompt) throw new Error("a prompt is required in non-interactive mode");
  const context = contextFiles(options);
  const prompt = context ? `${context}\n\n${options.prompt}` : options.prompt;
  const human = options.output === "human";
  let answerStarted = false;
  if (human) {
    process.stdout.write(`You\n└─ ${prompt}\n`);
    c.onReasoning = (text) => process.stdout.write(`\u001b[3;90m${text}\u001b[0m`);
    c.onText = (text) => {
      if (!answerStarted) {
        answerStarted = true;
        process.stdout.write("\ncagent\n└─ ");
      }
      process.stdout.write(text);
    };
  }
  const previousAsk = c.ask;
  c.ask = async (tool, args) => {
    if (options.permissionMode === "read-only") return false;
    if (options.permissionMode === "auto" || options.yes) return true;
    process.stderr.write(`permission required for ${tool.name}; use --yes or --permission-mode auto\n`);
    return false;
  };
  const abort = new AbortController();
  const onSignal = (signal: NodeJS.Signals) => {
    c.observability?.recordEvent("process.signal", { signal });
    c.interrupt();
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
  const timeout = setTimeout(() => c.interrupt(), options.timeoutMs);
  try {
    await c.submit(prompt);
    if (options.output === "jsonl") {
      for (const item of c.state.chat) {
        const event = { type: item.kind, content: item.content, tool: item.toolName, error: item.isError };
        process.stdout.write(`${JSON.stringify(event)}\n`);
      }
    } else {
      if (answerStarted) process.stdout.write("\n");
    }
  } finally {
    c.ask = previousAsk;
    clearTimeout(timeout);
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
  }
}
