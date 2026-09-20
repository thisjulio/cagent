import type { LoadResult } from "../loader";

export function installPluginCleanup(plugins: LoadResult): () => Promise<void> {
  let cleaningUp = false;
  const cleanup = async (): Promise<void> => {
    if (cleaningUp) return;
    cleaningUp = true;
    await plugins.cleanup();
  };
  process.once("SIGINT", async () => {
    await cleanup();
    process.exit(0);
  });
  process.once("SIGTERM", async () => {
    await cleanup();
    process.exit(0);
  });
  return cleanup;
}
