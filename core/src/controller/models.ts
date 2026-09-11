import { splitRoute } from "../route";
import type { Controller } from "./controller";

// ponytail: provedor que falha em list_models é ignorado; nome duplicado entre provedores → primeiro registro vence
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
  c.bump();
}

export function pickModel(c: Controller, route: string): void {
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
  c.bump();
}
