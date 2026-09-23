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
  const failures: string[] = [];
  for (const [provider, adapter] of registry.providers()) {
    try {
      const models = await adapter.list_models();
      if (models.length) return `${provider}/${models[0]}`;
      failures.push(`${provider}: no models returned`);
    } catch (error) {
      if (!isNetworkError(error)) throw error;
      const reason = error instanceof Error ? error.message : String(error);
      failures.push(`${provider}: ${reason}`);
      console.error(`Unable to list ${provider} models; trying next provider.`);
    }
  }
  throw new Error(
    failures.length
      ? `(no provider - nothing to do; ${failures.join("; ")})`
      : "(no provider - nothing to do)",
  );
}

export async function isRouteAvailable(
  route: string,
  registry: Registry,
): Promise<boolean> {
  const [provider, model] = splitRoute(route);
  const adapter = registry.provider(provider);
  if (!adapter) return false;
  try {
    return (await adapter.list_models()).includes(model);
  } catch (error) {
    if (!isNetworkError(error)) throw error;
    return true;
  }
}

function isNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /unable to connect|network|fetch failed|timed out|timeout/i.test(
    error.message,
  );
}
