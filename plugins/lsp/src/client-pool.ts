import { LspClient } from "./client";
import type { LspServerConfig } from "./types";

export type GetClient = (
  root: string,
  config: LspServerConfig,
) => Promise<LspClient>;

export function createClientPool() {
  const clients = new Map<string, Promise<LspClient>>();

  const getClient: GetClient = async (root, config) => {
    const key = `${root}:${config.command.join("\0")}`;
    let client = clients.get(key);
    if (client) {
      const active = await client;
      if (active.isAlive) return active;
      if (clients.get(key) === client) clients.delete(key);
      client = clients.get(key);
    }
    if (!client) {
      client = LspClient.start(root, config).catch((error) => {
        if (clients.get(key) === client) clients.delete(key);
        throw error;
      });
      clients.set(key, client);
    }
    return client;
  };

  const closeAll = async (): Promise<void> => {
    await Promise.all(
      [...clients.values()].map(async (client) =>
        (await client).close().catch(() => undefined),
      ),
    );
  };

  return { getClient, closeAll };
}
