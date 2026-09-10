import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "js-yaml";

export interface PluginConfig {
  name: string;
  path?: string;
  enabled?: boolean;
  config?: Record<string, unknown>;
}

export interface AppConfig {
  plugins: PluginConfig[];
  allowlist: string[];
  model?: string;
}

function readYaml(file: string): Record<string, unknown> {
  if (!fs.existsSync(file)) return {};
  return (yaml.load(fs.readFileSync(file, "utf8")) as Record<string, unknown>) ?? {};
}

export function loadConfig(cwd: string): AppConfig {
  const global = readYaml(path.join(os.homedir(), ".cagent", "config.yml"));
  const local = readYaml(path.join(cwd, "cagent.yml"));
  const globalPlugins = (global.plugins as PluginConfig[] | undefined) ?? [];
  const localPlugins = (local.plugins as PluginConfig[] | undefined) ?? [];
  return {
    plugins: localPlugins.length > 0 ? localPlugins : globalPlugins,
    allowlist: [
      ...((global.allowlist as string[] | undefined) ?? []),
      ...((local.allowlist as string[] | undefined) ?? []),
    ],
    model: (local.model as string | undefined) ?? (global.model as string | undefined) ?? process.env.CAGENT_MODEL,
  };
}
