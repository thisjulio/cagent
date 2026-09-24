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
  const impactForPath = async (
    input: string,
    changedRange?: { startLine: number; endLine: number },
  ): Promise<string | undefined> => {
    const file = path.resolve(input);
    const selected = serverForFile(servers, file);
    if (!selected || !fs.existsSync(file)) return undefined;
    try {
      const client = await getClient(process.cwd(), selected[1]);
      await client.sync(file);
      const symbols = (await client.call("documentSymbol", file)) as Array<{
        name?: string;
        kind?: number;
        range?: { start?: { line?: number }; end?: { line?: number } };
        selectionRange?: { start?: { line?: number } };
        children?: Array<{
          name?: string;
          kind?: number;
          range?: { start?: { line?: number }; end?: { line?: number } };
          selectionRange?: { start?: { line?: number } };
        }>;
      }>;
      const candidates = symbols
        .flatMap((symbol) => [symbol, ...(symbol.children ?? [])])
        .filter((symbol) => symbol.name && symbol.selectionRange?.start)
        .filter(
          (symbol) =>
            (symbol.range?.end?.line ?? 0) - (symbol.range?.start?.line ?? 0) >
            0,
        )
        .filter((symbol) => {
          if (!changedRange) return true;
          const start = (symbol.range?.start?.line ?? 0) + 1;
          const end = (symbol.range?.end?.line ?? 0) + 1;
          return end >= changedRange.startLine && start <= changedRange.endLine;
        })
        .slice(0, 12);
      const entries: string[] = [];
      const files = new Set<string>();
      for (const symbol of candidates) {
        if (files.size >= 20) break;
        const position = {
          line: symbol.selectionRange!.start!.line!,
          character: 0,
        };
        const refs = (await client.call(
          "references",
          file,
          position,
        )) as Array<{
          uri?: string;
          range?: { start?: { line?: number } };
        }>;
        const relevant = refs
          .filter((ref) => ref.uri && ref.uri !== `file://${file}`)
          .slice(0, 10);
        if (!relevant.length) continue;
        entries.push(
          `${symbol.name}: ${relevant
            .map((ref) => {
              const refFile = decodeURIComponent(
                ref.uri!.replace(/^file:\/\//, ""),
              );
              return `${path.relative(process.cwd(), refFile)}:${(ref.range?.start?.line ?? 0) + 1}`;
            })
            .join(", ")}`,
        );
        for (const ref of relevant) if (ref.uri) files.add(ref.uri);
      }
      return entries.length
        ? `LSP impact (${entries.length} symbols, capped):\n${entries.join("\n")}`
        : undefined;
    } catch {
      return undefined;
    }
  };
  const diagnosticsForPath = async (
    input: string,
  ): Promise<string | undefined> => {
    const file = path.resolve(input);
    const selected = serverForFile(servers, file);
    if (!selected || !fs.existsSync(file)) return undefined;
    try {
      const client = await getClient(process.cwd(), selected[1]);
      await client.sync(file);
      const diagnostics = (await client.call("diagnostics", file)) as Array<{
        range?: { start?: { line?: number; character?: number } };
        message?: string;
        severity?: number;
      }>;
      if (!diagnostics.length) return undefined;
      return diagnostics
        .map((diagnostic) => {
          const line = (diagnostic.range?.start?.line ?? 0) + 1;
          const character = (diagnostic.range?.start?.character ?? 0) + 1;
          return `${path.relative(process.cwd(), file)}:${line}:${character} ${diagnostic.message ?? "LSP diagnostic"}`;
        })
        .join("\n");
    } catch {
      return undefined;
    }
  };
  ctx.registerHook({
    name: "lsp-after-edit",
    phase: "after_tool",
    handle: async (event) => {
      if (
        !event.result?.changesWorkspace ||
        !["write_file", "replace_lines", "edit_file"].includes(
          event.tool ?? "",
        ) ||
        (typeof event.args?.path !== "string" &&
          !event.result.changedRanges?.length)
      )
        return;
      const changes = event.result.changedRanges ?? [
        {
          path: event.args!.path as string,
          startLine: 1,
          endLine: Number.MAX_SAFE_INTEGER,
        },
      ];
      const messages = await Promise.all(
        changes.map(async (change) => {
          const diagnostics = await diagnosticsForPath(change.path);
          const impact = await impactForPath(change.path, change);
          return [
            diagnostics ? `LSP diagnostics:\n${diagnostics}` : undefined,
            impact,
          ]
            .filter((message): message is string => Boolean(message))
            .join("\n");
        }),
      );
      const output = messages.filter(Boolean);
      return output.length
        ? { action: "continue" as const, message: output.join("\n") }
        : undefined;
    },
  });
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
          const client = await getClient(process.cwd(), selected[1]);
          await client.sync(file);
          const diagnostics = (await client.call(
            "diagnostics",
            file,
          )) as Array<{
            range?: { start?: { line?: number; character?: number } };
            message?: string;
            severity?: number;
          }>;
          for (const diagnostic of diagnostics) {
            const line = (diagnostic.range?.start?.line ?? 0) + 1;
            const character = (diagnostic.range?.start?.character ?? 0) + 1;
            ctx.activity(
              `${path.relative(process.cwd(), file)}:${line}:${character} ${diagnostic.message ?? "LSP diagnostic"}`,
              { source: "lsp", severity: diagnostic.severity ?? 1 },
            );
          }
        } catch {
          // Diagnostics are best-effort; explicit queries report unavailable servers.
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
