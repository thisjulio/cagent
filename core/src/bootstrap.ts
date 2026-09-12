import React from "react";
import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import type { Plugin } from "@cagent/sdk";
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

export interface BootstrapOptions {
  defaultPlugins?: AppConfig["plugins"];
  pluginLoaders?: Record<string, Plugin>;
}

export async function bootstrap(options: BootstrapOptions = {}): Promise<void> {
  const loaded = loadConfig(process.cwd());
  const config = loaded.plugins.length || !options.defaultPlugins ? loaded : { ...loaded, plugins: options.defaultPlugins };
  const registry = new Registry();
  const bus = new EventBus();
  const { promptSections } = await loadPlugins(config, registry, bus, { loaders: options.pluginLoaders });
  const skills = config.skills?.enabled === false ? undefined : addBuiltinSkills(
    discoverSkills(process.cwd(), config.skills?.roots),
  );
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
  const contextWindow = await adapter.context_window?.(splitRoute(route)[1]);
  const c = new Controller({
    config,
    registry,
    bus,
    adapter,
    model: route,
    contextWindow,
    systemPrompt: buildSystemPrompt(process.cwd(), promptSections, config.instructions, skills),
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
  });
  bus.on("tools/pre", (p) => c.onToolPre(p));
  bus.on("tools/post", (p) => c.onToolPost(p));
  bus.on("tools/denied", (p) => c.onToolDenied(p));
  bus.on("tools/stdout", (p) => c.onToolStream(p));
  bus.on("tools/stderr", (p) => c.onToolStream(p, "[stderr] "));
  const renderer = await createCliRenderer({ exitOnCtrlC: true });
  createRoot(renderer).render(React.createElement(App, { c }));
}
