import { splitRoute } from "../route";
import type { Controller } from "./controller";

// ponytail: providers that fail list_models are ignored; duplicate model names across providers use the first registration.
export async function openModelPicker(c: Controller): Promise<void> {
  const entries = await Promise.all(
    [...c.deps.registry.providers()].map(async ([route, a]) => {
      try {
        return { route, models: await a.list_models() };
      } catch {
        return null;
      }
    }),
  );
  c.state.modelPicker = { entries: entries.filter((e) => e !== null), query: "" };
  c.observability?.recordEvent("model_picker.opened", {
    "provider.count": c.deps.registry.providers().length,
    "model.count": c.state.modelPicker.entries.reduce((count, entry) => count + entry.models.length, 0),
  });
  c.bump();
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
  c.state.tokens = c.estimateCurrentTokens();
  c.observability?.recordEvent("model_picker.selected", { "model.route": route });
  c.bump();
}
