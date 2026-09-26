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
import { resolveRoute } from "./route-resolver";
import { Controller } from "./controller/controller";
import { appendChat, notify } from "./controller/chat-buffer";
import { App } from "./ui/components/App";
import { discoverSkills } from "./skills/discovery";
import {
  createReadSkillTool,
  readSkill,
  refreshReadSkillTool,
} from "./skills/read-tool";
import { addBuiltinSkills } from "./skills/builtin";
import { applySkillArguments } from "./skills/arguments";
import { createTaskTool } from "./tasks/task-tool";
import { createQuestionTool } from "./controller/question-tool";
import { createVerificationRunner } from "./verification/runner";
import { createCommandSource, discoverCommands } from "./commands/discovery";
import { discoverSubagents } from "./subagents/discovery";
import { addBuiltinSubagents } from "./subagents/builtin";
import { createSubagentExecutor } from "./subagents/executor";
import { createSubagentTool } from "./subagents/tool";
import type { ToolAsk } from "./tools";
import type { CliOptions } from "./cli-args";
import { createLocalObservability } from "./local-telemetry";
import { initializeModel } from "./controller/models";
import { runHeadless } from "./headless";
import { installPluginCleanup } from "./bootstrap/cleanup";
export interface BootstrapOptions {
  defaultPlugins?: AppConfig["plugins"];
  pluginLoaders?: Record<string, Plugin>;
  observability?: Observability;
  cli?: CliOptions;
  headless?: CliOptions;
  authCommand?: { provider: string; action: string };
}

export async function bootstrap(options: BootstrapOptions = {}): Promise<void> {
  const started = performance.now();
  const loaded = loadConfig(process.cwd());
  const telemetry =
    options.observability ??
    createLocalObservability(
      options.headless?.telemetry === true ||
        options.cli?.telemetry === true ||
        loaded.observability?.enabled === true,
      loaded.observability?.file,
    );
  telemetry.recordEvent("app.start", { interactive: !options.headless });
  const config =
    loaded.plugins.length || !options.defaultPlugins
      ? loaded
      : { ...loaded, plugins: options.defaultPlugins };
  if (options.headless?.model) config.model = options.headless.model;
  if (options.headless?.variant) config.variant = options.headless.variant;
  if (options.headless?.logLevel) config.log_level = options.headless.logLevel;
  const telemetryOverride =
    options.headless?.telemetry ?? options.cli?.telemetry;
  if (telemetryOverride !== undefined) {
    config.observability = {
      ...config.observability,
      enabled: telemetryOverride,
    };
  }
  const registry = new Registry();
  const bus = new EventBus();
  let mcpServerCount = 0;
  bus.on("mcp:servers_connected", (payload) => {
    const names = (payload as { connected?: unknown }).connected;
    if (Array.isArray(names)) mcpServerCount = names.length;
  });
  const verification = createVerificationRunner(process.cwd());
  const loadedPlugins = await loadPlugins(config, registry, bus, {
    loaders: options.pluginLoaders,
    observability: telemetry,
  });
  if (options.authCommand) {
    const command = registry.command(`auth.${options.authCommand.provider}`);
    if (!command)
      throw new Error(
        `provider does not support authentication: ${options.authCommand.provider}`,
      );
    const result = await command.execute({
      name: command.name,
      arguments: options.authCommand.action,
      values: {},
    });
    if (result) console.log(result);
    await loadedPlugins.cleanup();
    return;
  }

  const runCleanup = installPluginCleanup(loadedPlugins);
  if (options.headless) telemetry.recordEvent("headless.submit.ready");
  const subagents = addBuiltinSubagents(discoverSubagents(process.cwd()));
  for (const agent of subagents.agents) registry.registerSubagent(agent);
  const pluginSkillRoots = loadedPlugins.skillSources.flatMap((source) =>
    source.discover(process.cwd()),
  );
  const skills =
    config.skills?.enabled === false
      ? undefined
      : addBuiltinSkills(
          discoverSkills(process.cwd(), config.skills?.roots, pluginSkillRoots),
        );
  const skillTool = skills ? createReadSkillTool(skills) : undefined;
  const commands = discoverCommands(process.cwd(), [
    createCommandSource(),
    ...loadedPlugins.commandSources,
  ]);
  const reloadSkills = skills
    ? () => {
        const refreshed = addBuiltinSkills(
          discoverSkills(process.cwd(), config.skills?.roots, pluginSkillRoots),
        );
        skills.skills = refreshed.skills;
        skills.byName = refreshed.byName;
        if (skillTool) refreshReadSkillTool(skillTool, skills);
      }
    : undefined;
  if (skillTool) registry.registerTool(skillTool);
  let route = await resolveRoute(config, registry);
  let adapter = registry.provider(splitRoute(route)[0]);
  if (!adapter) throw new Error("(no provider - nothing to do)");
  if (route) telemetry.recordEvent("route.resolved", { "model.route": route });
  const contextWindow = route
    ? await adapter.context_window?.(splitRoute(route)[1])
    : 60_000;
  let ask: ToolAsk = async () => true;
  let currentModel = route;
  let controllerRef: Controller | null = null;
  const getModelRoute = (): string =>
    controllerRef?.state.model ?? currentModel;
  const executeSubagent = createSubagentExecutor({
    find: (name) => registry.subagent(name),
    registry,
    model: getModelRoute,
    tools: registry.tools(),
    allowlist: config.allowlist,
    ask: (...args) => ask(...args),
    bus,
    verification,
    readOnly: options.headless?.permissionMode === "read-only",
  });
  const c = new Controller({
    config,
    registry,
    bus,
    adapter,
    model: route,
    variant: config.variant,
    contextWindow,
    sessionId: options.cli?.session ?? options.headless?.session,
    maxTurns: options.headless?.maxTurns,
    maxToolCalls: options.headless?.maxToolCalls,
    readOnly:
      (options.cli?.permissionMode ?? options.headless?.permissionMode) ===
      "read-only",
    permissionMode:
      options.cli?.permissionMode ?? options.headless?.permissionMode,
    contextExtensions: loadedPlugins.contextExtensions,
    contextTokenBudget: config.context_extension_tokens,
    systemPrompt: buildSystemPrompt(
      process.cwd(),
      loadedPlugins.promptSections,
      config.instructions,
      skills,
    ),
    rebuildSystemPrompt: () =>
      buildSystemPrompt(
        process.cwd(),
        loadedPlugins.promptSections,
        config.instructions,
        skills,
      ),
    reloadSkills,
    invokeSkill: async (name, args) => {
      const record = skills?.byName.get(name);
      if (!record || record.metadata.userInvocable === false) return undefined;
      const content = await readSkill(skills!, name);
      if (content === undefined) return undefined;
      return {
        content: applySkillArguments(content, args),
        directory: record.directory,
      };
    },
    skillNames: () =>
      [...(skills?.byName.keys() ?? [])].filter(
        (name) => skills?.byName.get(name)?.metadata.userInvocable !== false,
      ),
    commands: commands.byName,
    pluginCommands: registry.commands().map((command) => command.name),
    pluginCommandSubcommands: Object.fromEntries(
      registry
        .commands()
        .filter((command) => command.subcommands)
        .map((command) => [command.name, command.subcommands!]),
    ),
    invokeSubagent: registry.subagents().length ? executeSubagent : undefined,
    observability: telemetry,
  });
  controllerRef = c;
  await c.registry.hooks.run({ phase: "session_start" });
  telemetry.recordMetric("app.startup_ms", performance.now() - started, {
    "plugin.count": loadedPlugins.commandSources.length,
  });
  ask = c.ask;
  if (registry.subagents().length) {
    registry.registerTool(
      createSubagentTool(
        () => registry.subagents().map((agent) => agent.name),
        executeSubagent,
      ),
    );
  }
  registry.registerTool(
    createTaskTool((operation, args) => c.updateTasks(operation, args)),
  );
  registry.registerTool(createQuestionTool(c.questionService));
  bus.on("tools/pre", (p) => c.onToolPre(p));
  bus.on("tools/post", (p) => c.onToolPost(p));
  bus.on("tools/denied", (p) => c.onToolDenied(p));
  bus.on("tools/stdout", (p) => c.onToolStream(p));
  bus.on("tools/stderr", (p) => c.onToolStream(p, "[stderr] "));
  bus.on("plugin/activity", (p) => {
    const event = p as { content?: string };
    if (event.content) {
      appendChat(c.state, {
        kind: "meta",
        content: event.content,
        timestamp: Date.now(),
      });
      c.state.chatVersion++;
      c.bump();
    }
  });
  if (options.headless) {
    try {
      await runHeadless(c, options.headless, telemetry);
    } finally {
      await runCleanup();
    }
    return;
  }
  const renderer = await createCliRenderer({ exitOnCtrlC: false });
  process.once("exit", () => renderer.destroy());
  createRoot(renderer).render(React.createElement(App, { c, mcpServerCount }));
  if (options.cli?.resume) c.openSessions();
  void c.detectLspStatus().catch(() => {});
  void initializeModel(c, config.model).catch((error) => {
    notify(c.state, error instanceof Error ? error.message : String(error));
  });
}
