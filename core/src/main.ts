import { loadConfig } from "./config";
import { EventBus } from "./events";
import { loadPlugins } from "./loader";
import { Registry } from "./registry";

async function main(): Promise<void> {
  const config = loadConfig(process.cwd());
  const registry = new Registry();
  const bus = new EventBus();
  const { contexts } = await loadPlugins(config, registry, bus);

  console.log(`plugins: ${contexts.map((c) => c.name).join(", ") || "(nenhum)"}`);
  console.log(`tools: ${registry.tools().map((t) => t.name).join(", ") || "(nenhum)"}`);
  console.log(`provedores: ${[...registry.providers().keys()].join(", ") || "(nenhum)"}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
