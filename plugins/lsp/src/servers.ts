import path from "node:path";
import type { LspServerConfig } from "./types";
import { resolveBinary } from "./resolve";

const defaults: Record<string, LspServerConfig> = {
  typescript: {
    command: [resolveBinary("typescript-language-server"), "--stdio"],
    extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"],
  },
  biome: {
    command: [resolveBinary("biome"), "lsp-proxy"],
    extensions: [
      ".ts",
      ".tsx",
      ".js",
      ".jsx",
      ".mjs",
      ".cjs",
      ".json",
      ".jsonc",
    ],
  },
  python: {
    command: [resolveBinary("pyright-langserver"), "--stdio"],
    extensions: [".py", ".pyi"],
  },
  rust: { command: ["rust-analyzer"], extensions: [".rs"] },
};

export function configuredServers(
  value: unknown,
): Record<string, LspServerConfig> {
  if (value === false) return {};
  const result = value === true || value === undefined ? { ...defaults } : {};
  if (!value || typeof value !== "object") return result;
  for (const [name, raw] of Object.entries(value)) {
    if (raw === false) {
      delete result[name];
      continue;
    }
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const base = result[name];
    const command = Array.isArray(item.command)
      ? item.command.map(String)
      : base?.command;
    const extensions = Array.isArray(item.extensions)
      ? item.extensions.map(String)
      : base?.extensions;
    if (!command || !extensions) continue;
    result[name] = {
      command,
      extensions,
      initialization: item.initialization as
        | Record<string, unknown>
        | undefined,
    };
  }
  return result;
}

export function serverForFile(
  servers: Record<string, LspServerConfig>,
  file: string,
): [string, LspServerConfig] | undefined {
  const extension = path.extname(file).toLowerCase();
  return Object.entries(servers).find(([, server]) =>
    server.extensions.includes(extension),
  );
}
