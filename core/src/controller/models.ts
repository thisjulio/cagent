import { splitRoute } from "../route";
import type { Controller } from "./controller";
import { saveLastChoice, loadLastChoice } from "./model-persistence";

// ponytail: providers that fail list_models are ignored; duplicate model names across providers use the first registration.
export async function openModelPicker(c: Controller): Promise<void> {
  const entries = await discoverModels(c);
  c.state.modelPicker = { entries: entries.filter((e) => e !== null), query: "" };
  c.observability?.recordEvent("model_picker.opened", {
    "provider.count": c.deps.registry.providers().length,
    "model.count": c.state.modelPicker.entries.reduce((count, entry) => count + entry.models.length, 0),
  });
  c.bump();
}

export async function initializeModel(c: Controller, configured?: string): Promise<void> {
  const entries = await discoverModels(c);
  const configuredEntry = configured && entries.find((e) => e.route === splitRoute(configured)[0] && e.models.includes(splitRoute(configured)[1]));
  
  let route = "";
  const last = loadLastChoice();
  if (last?.model) {
    const lastEntry = entries.find((e) => e.route === splitRoute(last.model)[0] && e.models.includes(splitRoute(last.model)[1]));
    if (lastEntry) {
      route = last.model;
      if (last.variant) c.state.variant = last.variant;
    }
  }
  
  if (!route && configured && configuredEntry) {
    route = configured;
  }
  
  if (!route) {
    const first = entries.find((entry) => entry.models.length);
    route = first ? `${first.route}/${first.models[0]}` : "";
  }
  
  if (!route) {
    c.state.notice = configured ? `Configured model is unavailable: ${configured}` : "No models available";
    c.bump();
    return;
  }
  const [provider, model] = splitRoute(route);
  const adapter = c.registry.provider(provider);
  if (!adapter) return;
  c.adapter = adapter;
  c.state.model = route;
  c.state.contextWindow = (await adapter.context_window?.(model)) ?? c.state.contextWindow;
  c.state.tokens = undefined;
  c.state.inputTokens = undefined;
  c.state.outputTokens = undefined;
  c.bump();
}

async function discoverModels(c: Controller): Promise<{ route: string; models: string[] }[]> {
  const entries = await Promise.all(
    [...c.registry.providers()].map(async ([route, a]) => {
      try { return { route, models: await a.list_models() }; } catch { return null; }
    }),
  );
  return entries.filter((entry): entry is { route: string; models: string[] } => entry !== null);
}

export async function pickModel(c: Controller, route: string): Promise<void> {
  const p = c.state.modelPicker;
  if (!p) return;
  const [prov, model] = splitRoute(route);
  const entry = p.entries.find((e) => e.route === prov && e.models.includes(model));
  if (!entry) return;
  const a = c.deps.registry.provider(prov);
  if (!a) return;
  c.adapter = a;
  c.state.model = route;
  c.state.modelPicker = null;
  c.state.contextWindow = (await a.context_window?.(model)) ?? c.state.contextWindow;
  c.state.tokens = undefined;
  c.state.inputTokens = undefined;
  c.state.outputTokens = undefined;
  c.observability?.recordEvent("model_picker.selected", { "model.route": route });
  saveLastChoice(route, c.state.variant);
  c.bump();
}
