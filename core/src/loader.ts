import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Plugin, PluginContext } from "@cagent/sdk";
import type { AppConfig } from "./config";
import { EventBus } from "./events";
import { Registry } from "./registry";

export interface LoadResult {
  contexts: PluginContext[];
  promptSections: Map<string, string>;
  commandSources: import("@cagent/sdk").CommandSource[];
}

export interface LoadOptions {
  loaders?: Record<string, Plugin>;
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

  for (const p of config.plugins) {
    if (p.enabled === false) continue;
    const source = p.path ?? p.name;
    const builtin = options.loaders?.[p.name];
    const spec = source.startsWith(".") ? pathToFileURL(path.resolve(source)).href : source;
    const mod = builtin ? undefined : ((await import(spec)) as Record<string, unknown>);
    const plugin = builtin ?? (mod?.default ?? mod?.register) as Plugin | undefined;
    if (typeof plugin !== "function") throw new Error(`plugin has no registration function: ${p.name}`);

    const ctx: PluginContext = {
      name: p.name,
      config: p.config ?? {},
      registerTool: (tool) => registry.registerTool(tool),
      registerProvider: (route, adapter) => registry.registerProvider(route, adapter),
      registerSubagent: (agent) => registry.registerSubagent(agent),
      emit: (event, payload) => bus.emit(event, payload),
      on: (event, handler) => bus.on(event, handler),
      promptSection: (name, content) => promptSections.set(name, content),
      registerCommandSource: (source) => commandSources.push(source),
    };
    await plugin(ctx);
    contexts.push(ctx);
  }

  return { contexts, promptSections, commandSources };
}
