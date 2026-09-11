import React from "react";
import { render } from "ink";
import { loadConfig, type AppConfig } from "./config";
import { loadPlugins } from "./loader";
import { EventBus } from "./events";
import { Registry } from "./registry";
import { buildSystemPrompt } from "./prompt";
import { splitRoute } from "./route";
import { Controller } from "./controller/controller";
import { App } from "./ui/components/App";

export async function resolveRoute(config: AppConfig, registry: Registry): Promise<string> {
  if (config.model) {
    const [prov, model] = splitRoute(config.model);
    const adapter = registry.provider(prov);
    if (!adapter) throw new Error(`provedor não encontrado: ${prov}`);
    const models = await adapter.list_models();
    if (!models.includes(model)) throw new Error(`modelo ${model} não existe no provedor ${prov} (disponíveis: ${models.join(", ")})`);
    return config.model;
  }
  const first = registry.llmRoute();
  if (!first) throw new Error("(sem provedor — nada a fazer)");
  const models = await registry.provider(first)!.list_models();
  if (!models.length) throw new Error("(sem provedor — nada a fazer)");
  return `${first}/${models[0]}`;
}

export async function bootstrap(): Promise<void> {
  const config = loadConfig(process.cwd());
  const registry = new Registry();
  const bus = new EventBus();
  const { promptSections } = await loadPlugins(config, registry, bus);
  let route: string;
  try {
    route = await resolveRoute(config, registry);
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
  const adapter = registry.provider(splitRoute(route)[0])!;
  const c = new Controller({
    config,
    registry,
    bus,
    adapter,
    model: route,
    systemPrompt: buildSystemPrompt(process.cwd(), promptSections, config.instructions),
  });
  bus.on("tools/pre", (p) => c.onToolPre(p));
  bus.on("tools/post", (p) => c.onToolPost(p));
  bus.on("tools/denied", (p) => c.onToolDenied(p));
  bus.on("tools/stdout", (p) => c.onToolStream(p));
  bus.on("tools/stderr", (p) => c.onToolStream(p, "[stderr] "));
  render(React.createElement(App, { c }));
}
