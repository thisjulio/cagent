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
  instructions?: string[];
  model?: string;
  variant?: string;
  compact_threshold_tokens?: number;
  compact_threshold_percent?: number;
  compact_auto?: boolean;
  compact_keep_tokens?: number;
  compact_prune_tool_tokens?: number;
  retry_attempts?: number;
  permissions?: boolean;
  log_level?: "silent" | "error" | "warn" | "info" | "debug";
  observability?: { enabled?: boolean; file?: string };
  skills?: { enabled?: boolean; roots?: string[] };
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
    instructions: [
      ...((global.instructions as string[] | undefined) ?? []),
      ...((local.instructions as string[] | undefined) ?? []),
    ],
    model: (local.model as string | undefined) ?? (global.model as string | undefined) ?? process.env.CAGENT_MODEL,
    variant: (local.variant as string | undefined) ?? (global.variant as string | undefined) ?? process.env.CAGENT_VARIANT,
    compact_threshold_tokens: (local.compact_threshold_tokens as number | undefined) ?? (global.compact_threshold_tokens as number | undefined),
    compact_threshold_percent: (local.compact_threshold_percent as number | undefined) ?? (global.compact_threshold_percent as number | undefined),
    compact_auto: (local.compact_auto as boolean | undefined) ?? (global.compact_auto as boolean | undefined) ?? true,
    compact_keep_tokens: (local.compact_keep_tokens as number | undefined) ?? (global.compact_keep_tokens as number | undefined),
    compact_prune_tool_tokens: (local.compact_prune_tool_tokens as number | undefined) ?? (global.compact_prune_tool_tokens as number | undefined) ?? 2000,
    retry_attempts: (local.retry_attempts as number | undefined) ?? (global.retry_attempts as number | undefined),
    permissions: (local.permissions as boolean | undefined) ?? (global.permissions as boolean | undefined) ?? true,
    log_level: (local.log_level as AppConfig["log_level"]) ?? (global.log_level as AppConfig["log_level"]) ?? "silent",
    observability: {
      enabled: (local.observability as AppConfig["observability"] | undefined)?.enabled
        ?? (global.observability as AppConfig["observability"] | undefined)?.enabled ?? false,
      file: (local.observability as AppConfig["observability"] | undefined)?.file
        ?? (global.observability as AppConfig["observability"] | undefined)?.file,
    },
    skills: {
      enabled: (local.skills as { enabled?: boolean } | undefined)?.enabled
        ?? (global.skills as { enabled?: boolean } | undefined)?.enabled ?? true,
      roots: (local.skills as { roots?: string[] } | undefined)?.roots
        ?? (global.skills as { roots?: string[] } | undefined)?.roots,
    },
  };
}
