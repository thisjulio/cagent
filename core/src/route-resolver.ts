import type { AppConfig } from "./config";
import type { Registry } from "./registry";
import { splitRoute } from "./route";

export async function resolveRoute(
  config: AppConfig,
  registry: Registry,
): Promise<string> {
  if (config.model) {
    const [prov, model] = splitRoute(config.model);
    const adapter = registry.provider(prov);
    if (!adapter) throw new Error(`provider not found: ${prov}`);
    try {
      const models = await adapter.list_models();
      if (!models.includes(model))
        throw new Error(
          `model ${model} does not exist in provider ${prov} (available: ${models.join(", ")})`,
        );
    } catch (error) {
      if (!isNetworkError(error)) throw error;
      console.error(
        `Unable to list ${prov} models; using configured model ${model}.`,
      );
    }
    return config.model;
  }
  const first = registry.llmRoute();
  if (!first) throw new Error("(no provider - nothing to do)");
  const models = await registry.provider(first)!.list_models();
  if (!models.length) throw new Error("(no provider - nothing to do)");
  return `${first}/${models[0]}`;
}

function isNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /unable to connect|network|fetch failed|timed out|timeout/i.test(
    error.message,
  );
}
