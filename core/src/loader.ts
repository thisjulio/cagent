import path from "node:path";
import { pathToFileURL } from "node:url";
import { noopObservability, trace, type Observability, type Plugin, type PluginContext } from "@cagent/sdk";
import type { AppConfig } from "./config";
import { EventBus } from "./events";
import { Registry } from "./registry";
import fs from "node:fs";

export interface LoadResult {
  contexts: PluginContext[];
  promptSections: Map<string, string>;
  commandSources: import("@cagent/sdk").CommandSource[];
  skillSources: import("@cagent/sdk").SkillSource[];
  contextExtensions: import("@cagent/sdk").ContextExtension[];
}

export interface LoadOptions {
  loaders?: Record<string, Plugin>;
  observability?: Observability;
}

export async function loadPlugins(
  config: AppConfig,
  registry: Registry,
  bus: EventBus,
  options: LoadOptions = {},
): Promise<LoadResult> {
  const contexts: PluginContext[] = [];
  const promptSections = new Map<string, string>();
  const commandSources: import("@cagent/sdk").CommandSource[] = [];
  const skillSources: import("@cagent/sdk").SkillSource[] = [];
  const contextExtensions: import("@cagent/sdk").ContextExtension[] = [];
  const observability = options.observability ?? noopObservability;

  for (const p of config.plugins) {
    if (p.enabled === false) continue;
    const source = p.path ?? p.name;
    const builtin = options.loaders?.[p.name] ?? options.loaders?.[path.basename(source)];
    const spec = source.startsWith(".") ? pathToFileURL(path.resolve(source)).href : source;
    const mod = builtin ? undefined : ((await import(spec)) as Record<string, unknown>);
    const plugin = builtin ?? (mod?.default ?? mod?.register) as Plugin | undefined;
    if (typeof plugin !== "function") throw new Error(`plugin has no registration function: ${p.name}`);

    const ctx: PluginContext = {
      name: p.name,
      config: { ...p.config, log_level: config.log_level },
      observability,
      storage: {
        namespace: p.name,
        path: (...segments) => path.join(path.resolve(process.env.CAGENT_DATA_DIR ?? path.join(process.env.HOME ?? ".", ".cagent"), "plugins", p.name), ...segments),
      },
      diagnostics: {
        report: (diagnostic) => {
          observability.recordEvent("plugin.diagnostic", {
            "plugin.name": p.name,
            "diagnostic.level": diagnostic.level,
            "diagnostic.code": diagnostic.code,
          });
          if (diagnostic.level === "error") console.error(`[${p.name}] ${diagnostic.code}: ${diagnostic.message}`);
        },
      },
      registerTool: (tool) => registry.registerTool(tool),
      registerHook: (hook) => registry.registerHook(hook),
      registerProvider: (route, adapter) => registry.registerProvider(route, adapter),
      registerSubagent: (agent) => registry.registerSubagent(agent),
      emit: (event, payload) => bus.emit(event, payload),
      on: (event, handler) => bus.on(event, handler),
      promptSection: (name, content) => promptSections.set(name, content),
      registerContextExtension: (extension) => contextExtensions.push(extension),
      registerCommandSource: (source) => commandSources.push(source),
      registerSkillSource: (source) => skillSources.push(source),
      registerCommand: (command) => registry.registerCommand(command),
      contributeContext: async (input) => {
        const results: import("@cagent/sdk").ContextContribution[] = [];
        for (const extension of contextExtensions) {
          const contribution = await extension.contribute(input);
          if (contribution) results.push(contribution);
        }
        return results;
      },
      activity: (content, attributes = {}) => {
        bus.emit("plugin/activity", { plugin: p.name, content, attributes });
      },
    };
    await trace(observability, "plugin.load", () => plugin(ctx), { "plugin.name": p.name });
    contexts.push(ctx);
  }

  return { contexts, promptSections, commandSources, skillSources, contextExtensions };
}