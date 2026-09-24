import { defineTool, type PluginContext, type ToolArgs } from "@cagent/sdk";
import fs from "node:fs";
import path from "node:path";
import { LspClient } from "./client";
import { configuredServers, serverForFile } from "./servers";
import type { LspServerConfig } from "./types";

export function lspTool(ctx: PluginContext) {
  const clients = new Map<string, Promise<LspClient>>();
  const servers = configuredServers(ctx.config.lsp);
  const getClient = (root: string, config: LspServerConfig) => {
    const key = `${root}:${config.command.join("\0")}`;
    let client = clients.get(key);
    if (!client) {
      client = LspClient.start(root, config).catch((error) => {
        clients.delete(key);
        throw error;
      });
      clients.set(key, client);
    }
    return client;
  };
  ctx.registerCleanup(async () => {
    await Promise.all(
      [...clients.values()].map(async (client) =>
        (await client).close().catch(() => undefined),
      ),
    );
  });
  const sync = async (payload: unknown) => {
    if (!payload || typeof payload !== "object") return;
    const data = payload as { path?: unknown; paths?: unknown };
    const paths = [
      ...(typeof data.path === "string" ? [data.path] : []),
      ...(Array.isArray(data.paths)
        ? data.paths.filter((item): item is string => typeof item === "string")
        : []),
    ];
    await Promise.all(
      paths.map(async (input) => {
        const file = path.resolve(input);
        const selected = serverForFile(servers, file);
        if (!selected || !fs.existsSync(file)) return;
        try {
          await (await getClient(process.cwd(), selected[1])).sync(file);
        } catch {
          // An explicit query reports unavailable servers to the agent.
        }
      }),
    );
  };
  ctx.on("code-tools/write", sync);
  ctx.on("code-tools/edit", sync);
  return defineTool(
    "lsp",
    "Queries TypeScript, JavaScript, Python, and Rust language servers.",
    {
      type: "object",
      properties: {
        operation: {
          type: "string",
          enum: [
            "diagnostics",
            "hover",
            "definition",
            "references",
            "documentSymbol",
          ],
        },
        path: {
          type: "string",
          description: "File path relative to the workspace or absolute",
        },
        line: { type: "integer", description: "1-based line number" },
        character: {
          type: "integer",
          description: "1-based character number",
        },
      },
      required: ["operation", "path"],
    },
    async (args: ToolArgs) => {
      const file = path.resolve(String(args.path));
      if (!fs.existsSync(file)) {
        return { output: `ERROR E_NOT_FOUND — ${file}`, isError: true };
      }
      const selected = serverForFile(servers, file);
      if (!selected) {
        return { output: `ERROR E_LSP_UNSUPPORTED — ${file}`, isError: true };
      }
      try {
        const [name, config] = selected;
        const position =
          args.line !== undefined && args.character !== undefined
            ? {
                line: Number(args.line) - 1,
                character: Number(args.character) - 1,
              }
            : undefined;
        const result = await (await getClient(process.cwd(), config)).call(
          String(args.operation),
          file,
          position,
        );
        return {
          output: `${name} ${args.operation} ${file}\n${JSON.stringify(result, null, 2)}`,
        };
      } catch (error) {
        return {
          output: `ERROR E_LSP — ${error instanceof Error ? error.message : String(error)}`,
          isError: true,
        };
      }
    },
    { readOnly: true },
  );
}
