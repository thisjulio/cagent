import { splitRoute } from "../route";
import type { Controller } from "./controller";
import { saveLastChoice, loadLastChoice } from "./model-persistence";
import { compactionThreshold } from "./compaction-threshold";
import { notify } from "./chat-buffer";

// ponytail: providers that fail list_models are ignored; duplicate model names across providers use the first registration.
export async function openModelPicker(c: Controller): Promise<void> {
  const entries = await discoverModels(c);
  c.state.modelPicker = {
    entries: entries.filter((e) => e !== null),
    query: "",
  };
  c.observability?.recordEvent("model_picker.opened", {
    "provider.count": c.deps.registry.providers().length,
    "model.count": c.state.modelPicker.entries.reduce(
      (count, entry) => count + entry.models.length,
      0,
    ),
  });
  c.bump();
}

export async function initializeModel(
  c: Controller,
  configured?: string,
): Promise<void> {
  let route = "";

  // ponytail: trust the saved choice; do not validate against list_models()
  // because providers may be slow to respond (e.g. llama.cpp loading). If the
  // model is gone, the error surfaces when the user sends a message.
  const last = loadLastChoice(c.modelChoiceFile);
  if (last?.model) {
    route = last.model;
  }

  if (!route && configured) {
    route = configured;
  }

  if (!route) {
    const entries = await discoverModels(c);
    const first = entries.find((entry) => entry.models.length);
    route = first ? `${first.route}/${first.models[0]}` : "";
  }

  if (!route) {
    notify(c.state, "No models available");
    return;
  }

  // ponytail: if the user picked a model via the picker before initialization
  // completed, don't override their choice
  if (!last?.model && c.state.model && c.state.model !== route) {
    return;
  }

  const [provider, model] = splitRoute(route);
  const adapter = c.registry.provider(provider);
  if (!adapter) return;
  await applyModelSelection(
    c,
    route,
    adapter,
    last?.variant ?? c.state.variant,
  );
  c.bump();
}

async function discoverModels(
  c: Controller,
): Promise<{ route: string; models: string[] }[]> {
  const providers = [...c.registry.providers()];
  const results = await Promise.all(
    providers.map(async ([route, a]) => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const models = await a.list_models();
          if (models.length > 0) return { route, models };
        } catch {
          // retry
        }
        if (attempt < 2) {
          // ponytail: wait before retrying; slow providers (llama.cpp loading) need time
          await new Promise((r) => setTimeout(r, 500));
        }
      }
      return null;
    }),
  );
  return results.filter(
    (entry): entry is { route: string; models: string[] } => entry !== null,
  );
}

export async function pickModel(c: Controller, route: string): Promise<void> {
  const p = c.state.modelPicker;
  if (!p) return;
  const [prov, model] = splitRoute(route);
  const entry = p.entries.find(
    (e) => e.route === prov && e.models.includes(model),
  );
  if (!entry) return;
  const a = c.deps.registry.provider(prov);
  if (!a) return;
  c.state.modelPicker = null;
  // ponytail: clear variant when switching models via UI so the new model
  // starts without inheriting the previous model's variant
  await applyModelSelection(c, route, a, undefined);
  c.observability?.recordEvent("model_picker.selected", {
    "model.route": route,
  });
  saveLastChoice(route, undefined, c.modelChoiceFile);
  c.bump();
}

async function applyModelSelection(
  c: Controller,
  route: string,
  adapter: Controller["adapter"],
  variant?: string,
): Promise<void> {
  const [, model] = splitRoute(route);
  c.adapter = adapter;
  c.state.model = route;
  c.state.variant = variant;
  c.state.contextWindow =
    (await adapter.context_window?.(model)) ?? c.state.contextWindow;
  c.state.threshold = compactionThreshold(c.state.contextWindow, c.config);
  c.state.tokens = undefined;
  c.state.inputTokens = undefined;
  c.state.outputTokens = undefined;
}
