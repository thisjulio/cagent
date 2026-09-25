import { splitRoute } from "../route";
import type { Controller } from "./controller";
import { compactionThreshold } from "./compaction-threshold";
import { notify } from "./chat-buffer";
import type { SessionModelSelection } from "../session/index";
import { findLatestModelSelection } from "./sessions";

// ponytail: providers that fail list_models are ignored; duplicate model names across providers use the first registration.
export async function openModelPicker(c: Controller): Promise<void> {
  const entries = await discoverModels(c);
  c.state.modelPicker = {
    entries,
    query: "",
    selectedIndex: 0,
  };
  c.observability?.recordEvent("model_picker.opened", {
    "provider.count": [...c.registry.providers()].length,
    "model.count": c.state.modelPicker.entries.reduce(
      (count, entry) => count + entry.models.length,
      0,
    ),
  });
  c.bump();
}

export function moveModelPicker(c: Controller, direction: "up" | "down"): void {
  const picker = c.state.modelPicker;
  if (!picker) return;
  const models = picker.entries.reduce(
    (count, entry) => count + entry.models.length,
    0,
  );
  if (!models) return;
  const selectedIndex = picker.selectedIndex ?? 0;
  picker.selectedIndex =
    direction === "down"
      ? (selectedIndex + 1) % models
      : (selectedIndex + models - 1) % models;
  c.bump();
}

export function selectModelPickerEntry(c: Controller): Promise<void> {
  const picker = c.state.modelPicker;
  if (!picker) return Promise.resolve();
  const route = picker.entries.flatMap((entry) =>
    entry.models.map((model) => `${entry.route}/${model}`),
  )[picker.selectedIndex ?? 0];
  return route ? pickModel(c, route) : Promise.resolve();
}

export async function initializeModel(
  c: Controller,
  configured?: string,
): Promise<void> {
  let route = "";

  const sessionChoice = c.session.load().modelSelection;
  if (sessionChoice?.model) route = sessionChoice.model;
  if (!route) {
    const latest = findLatestModelSelection(c.sessionDir);
    if (latest?.model) route = latest.model;
  }
  const hasAuthoritativeSource = !!route;

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
  if (!hasAuthoritativeSource && c.state.model && c.state.model !== route) {
    return;
  }

  const [provider, model] = splitRoute(route);
  const adapter = c.registry.provider(provider);
  if (!adapter) return;
  await applyModelSelection(
    c,
    route,
    adapter,
    sessionChoice?.variant ?? (sessionChoice ? undefined : c.state.variant),
  );
  c.bump();
}

async function discoverModels(
  c: Controller,
): Promise<
  { route: string; models: string[]; details: Record<string, string> }[]
> {
  const providers = [...c.registry.providers()];
  const results = await Promise.all(
    providers.map(async ([route, a]) => {
      for (let attempt = 0; attempt < 3; attempt++) {
        let models: string[] = [];
        try {
          models = await a.list_models();
        } catch {
          // retry
        }
        if (models.length > 0) {
          const details: Record<string, string> = {};
          await Promise.all(
            models.map(async (model) => {
              let window: number | undefined;
              let variants: string[] | undefined;
              try {
                [window, variants] = await Promise.all([
                  a.context_window?.(model),
                  a.supported_variants?.(model),
                ]);
              } catch {
                // Metadata is optional; keep the model available in the picker.
              }
              details[model] = [
                window
                  ? `${new Intl.NumberFormat().format(window)} context`
                  : "",
                variants?.length ? `variants: ${variants.join(", ")}` : "",
              ]
                .filter(Boolean)
                .join(" · ");
            }),
          );
          return { route, models, details };
        }
        if (attempt < 2) {
          // ponytail: wait before retrying; slow providers (llama.cpp loading) need time
          await new Promise((r) => setTimeout(r, 500));
        }
      }
      return null;
    }),
  );
  return results.filter((entry) => entry !== null);
}

export async function pickModel(c: Controller, route: string): Promise<void> {
  const p = c.state.modelPicker;
  if (!p) return;
  const [prov, model] = splitRoute(route);
  const entry = p.entries.find(
    (e) => e.route === prov && e.models.includes(model),
  );
  if (!entry) return;
  const a = c.registry.provider(prov);
  if (!a) return;
  c.state.modelPicker = null;
  // ponytail: clear variant when switching models via UI so the new model
  // starts without inheriting the previous model's variant
  await applyModelSelection(c, route, a, undefined);
  c.observability?.recordEvent("model_picker.selected", {
    "model.route": route,
  });
  c.session.appendModelSelection({ model: route });
  c.bump();
}

export async function restoreModelSelection(
  c: Controller,
  selection: SessionModelSelection,
): Promise<void> {
  const [provider, model] = splitRoute(selection.model);
  const adapter = c.registry.provider(provider);
  if (!adapter) return;
  await applyModelSelection(
    c,
    selection.model,
    adapter,
    selection.variant,
    false,
  );
  c.bump();
}

async function applyModelSelection(
  c: Controller,
  route: string,
  adapter: Controller["adapter"],
  variant?: string,
  persist = true,
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
  if (persist)
    c.session.appendModelSelection({
      model: route,
      ...(variant ? { variant } : {}),
    });
}
