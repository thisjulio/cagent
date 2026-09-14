import { pluginLoaders } from "./release-plugins";
import { bootstrap } from "./core/src/bootstrap";
import { runCli } from "./core/src/cli";

const defaultPlugins = Object.keys(pluginLoaders)
  .filter((name) => name !== "stub")
  .map((name) => ({ name }));

async function main() {
  const bootstrapOptions = { defaultPlugins, pluginLoaders };
  if (await runCli(process.argv.slice(2), bootstrapOptions)) return;
  await bootstrap(bootstrapOptions);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
