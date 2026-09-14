import { defineTool, type Plugin, type ToolDefinition } from "@cagent/sdk";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { McpClient } from "./client.ts";
import { discoverMcpServers } from "./discovery.ts";
import type { McpServerConfig, McpTool } from "./types.ts";

// ponytail: MCP plugin connects to configured MCP servers at startup, discovers
// their tools, and registers them in the cagent registry. Tool names use an
// explicit namespace to keep their origin visible (e.g., "mcp-filesystem-read_file").

interface ResolvedServer {
  name: string;
  client: McpClient;
  tools: McpTool[];
}

function resolveServers(config: Record<string, unknown>): McpServerConfig[] {
  const servers = config.servers as Record<string, Record<string, unknown>> | undefined;
  if (!servers) return [];

  return Object.entries(servers).map(([name, cfg]) => ({
    name,
    transport: (cfg.transport as "stdio" | "http") || "stdio",
    command: cfg.command as string | undefined,
    args: (cfg.args as string[]) || [],
    env: cfg.env as Record<string, string> | undefined,
    url: cfg.url as string | undefined,
    auth: cfg.auth as { type: "bearer"; token?: string; token_env?: string } | undefined,
    timeout_ms: cfg.timeout_ms as number | undefined,
  }));
}

function connectServer(
  server: McpServerConfig,
  logLevel: "silent" | "error" | "warn" | "info" | "debug",
): Promise<ResolvedServer> {
  return new Promise(async (resolve, reject) => {
    try {
      let transport;
      if (server.transport === "stdio") {
        if (!server.command) throw new Error(`Server ${server.name}: missing command`);
        const stdio = new StdioClientTransport({
          command: server.command,
          args: server.args || [],
          env: { ...process.env, ...server.env },
          stderr: "pipe",
        });
        if (stdio.stderr && (logLevel === "info" || logLevel === "debug")) {
          stdio.stderr.on("data", (chunk: Buffer) => process.stderr.write(chunk));
        }
        transport = stdio;
      } else {
        if (!server.url) throw new Error(`Server ${server.name}: missing url`);
        const headers: Record<string, string> = {};
        if (server.auth?.type === "bearer") {
          const token = server.auth.token_env
            ? process.env[server.auth.token_env]
            : server.auth.token;
          if (token) headers["Authorization"] = `Bearer ${token}`;
        }
        transport = new StreamableHTTPClientTransport(new URL(server.url), {
          requestInit: { headers },
        });
      }

      const client = new McpClient(transport);
      const timeout = server.timeout_ms || 10000;

      // Initialize with timeout
      const initPromise = client.initialize({ name: "cagent", version: "0.1.0" });
      const initTimeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Server ${server.name}: init timeout`)), timeout),
      );
      await Promise.race([initPromise, initTimeout]);

      // List tools with timeout
      const toolsPromise = client.listTools();
      const toolsTimeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Server ${server.name}: listTools timeout`)), timeout),
      );
      const tools = await Promise.race([toolsPromise, toolsTimeout]);

      resolve({ name: server.name, client, tools });
    } catch (e) {
      reject(e);
    }
  });
}

function mergeServers(
  discovered: McpServerConfig[],
  config: McpServerConfig[],
): McpServerConfig[] {
  const byName = new Map<string, McpServerConfig>();
  for (const s of discovered) byName.set(s.name, s);
  for (const s of config) byName.set(s.name, s);
  return Array.from(byName.values());
}

const register: Plugin = async (ctx) => {
  // ponytail: Merge config servers with .mcp.json discovered servers.
  // Config servers take precedence for the same name.
  const configServers = resolveServers(ctx.config);
  const discovered = discoverMcpServers(process.cwd(), process.env.CAGENT_MCP_GLOBAL_HOME);
  const allServers = mergeServers(discovered, configServers);
  if (allServers.length === 0) return;
  const logLevel = (ctx.config.log_level as "silent" | "error" | "warn" | "info" | "debug") || "silent";

  // Connect to all servers in parallel with individual timeouts
  const results = await Promise.allSettled(
    allServers.map((s) => connectServer(s, logLevel)),
  );

  const connected: ResolvedServer[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      connected.push(result.value);
    } else {
      console.error(`[mcp] Failed to connect: ${result.reason?.message || result.reason}`);
    }
  }

  // Register discovered tools
  for (const server of connected) {
    for (const tool of server.tools) {
      const prefixedName = `mcp-${server.name}-${tool.name}`.replace(/[^a-zA-Z0-9_-]/g, "_");
      const toolDef: ToolDefinition = defineTool(
        prefixedName,
        tool.description || `MCP tool from ${server.name}`,
        tool.inputSchema,
        async (args) => {
          try {
            const { signal: _signal, ...mcpArgs } = args;
            const result = await server.client.callTool(tool.name, mcpArgs);
            const text = result.content
              .filter((c) => c.type === "text")
              .map((c) => c.text)
              .join("\n");
            return { output: text, isError: result.isError };
          } catch (e) {
            return { output: `MCP tool error: ${e.message}`, isError: true };
          }
        },
      );
      ctx.registerTool(toolDef);
    }
  }

  // Emit event for UI/logging
  ctx.emit("mcp:servers_connected", {
    connected: connected.map((s) => s.name),
    total_tools: connected.reduce((acc, s) => acc + s.tools.length, 0),
  });
};

export default register;