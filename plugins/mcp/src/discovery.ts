import fs from "node:fs";
import path from "node:path";
import type { McpServerConfig } from "./types.ts";

// ponytail: Discovers MCP servers from .mcp.json files in Claude Code/Codex format.
// Looks in project root first, then home directory. Format:
// { "mcpServers": { "name": { "command": "...", "args": [...], "env": {...} } } }

interface McpJsonServer {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  type?: "stdio" | "http";
}

interface McpJsonConfig {
  mcpServers: Record<string, McpJsonServer>;
}

function parseMcpJson(filePath: string): McpServerConfig[] {
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const config: McpJsonConfig = JSON.parse(raw);
    if (!config.mcpServers) return [];

    return Object.entries(config.mcpServers).map(([name, srv]) => {
      const isHttp = srv.type === "http" || srv.url !== undefined;
      return {
        name,
        transport: isHttp ? "http" : "stdio",
        command: srv.command,
        args: srv.args || [],
        env: srv.env,
        url: srv.url,
        timeout_ms: undefined,
      };
    });
  } catch (e) {
    console.error(`[mcp] Failed to parse ${filePath}: ${e.message}`);
    return [];
  }
}

export function discoverMcpServers(cwd: string, globalHome?: string): McpServerConfig[] {
  // Project-level .mcp.json takes precedence
  const projectConfig = path.join(cwd, ".mcp.json");
  const projectServers = parseMcpJson(projectConfig);
  if (projectServers.length > 0) return projectServers;

  // Fallback to global ~/.mcp.json
  if (!globalHome) return [];
  const globalConfig = path.join(globalHome, ".mcp.json");
  return parseMcpJson(globalConfig);
}