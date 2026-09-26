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
          (symbol.range?.end?.line ?? 0) - (symbol.range?.start?.line ?? 0) > 0,
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
      const refs = (await client.call("references", file, position)) as Array<{
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
  };
  const diagnosticsForPath = async (
    input: string,
  ): Promise<{ text?: string; count: number }> => {
    const file = path.resolve(input);
    const selected = serverForFile(servers, file);
    if (!selected || !fs.existsSync(file)) return { count: 0 };
    const client = await getClient(process.cwd(), selected[1]);
    await client.sync(file);
    const diagnostics = (await client.call("diagnostics", file)) as Array<{
      range?: { start?: { line?: number; character?: number } };
      message?: string;
      severity?: number;
    }>;
    if (!diagnostics.length) return { count: 0 };
    return {
      count: diagnostics.length,
      text: diagnostics
        .map((diagnostic) => {
          const line = (diagnostic.range?.start?.line ?? 0) + 1;
          const character = (diagnostic.range?.start?.character ?? 0) + 1;
          return `${path.relative(process.cwd(), file)}:${line}:${character} ${diagnostic.message ?? "LSP diagnostic"}`;
        })
        .join("\n"),
    };
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
      const results = await Promise.all(
        changes.map(async (change) => {
          const file = path.resolve(change.path);
          const selected = serverForFile(servers, file);
          if (!selected || !fs.existsSync(file)) {
            return { path: change.path, status: "skipped" as const };
          }
          const startedAt = performance.now();
          const [diagnosticsResult, impactResult] = await Promise.allSettled([
            diagnosticsForPath(change.path),
            impactForPath(change.path, change),
          ]);
          const failures = [diagnosticsResult, impactResult].filter(
            (result): result is PromiseRejectedResult =>
              result.status === "rejected",
          );
          if (failures.length) {
            return {
              path: change.path,
              server: selected[0],
              status: "error" as const,
              diagnostics:
                diagnosticsResult.status === "fulfilled"
                  ? diagnosticsResult.value.text
                  : undefined,
              diagnosticCount:
                diagnosticsResult.status === "fulfilled"
                  ? diagnosticsResult.value.count
                  : 0,
              impact:
                impactResult.status === "fulfilled"
                  ? impactResult.value
                  : undefined,
              error: failures
                .map((failure) =>
                  failure.reason instanceof Error
                    ? failure.reason.message
                    : String(failure.reason),
                )
                .join("; "),
              durationMs: performance.now() - startedAt,
            };
          }
          return {
            path: change.path,
            server: selected[0],
            status: "success" as const,
            diagnostics:
              diagnosticsResult.status === "fulfilled"
                ? diagnosticsResult.value.text
                : undefined,
            diagnosticCount:
              diagnosticsResult.status === "fulfilled"
                ? diagnosticsResult.value.count
                : 0,
            impact:
              impactResult.status === "fulfilled"
                ? impactResult.value
                : undefined,
            durationMs: performance.now() - startedAt,
          };
        }),
      );
      for (const result of results) {
        ctx.observability.recordEvent("lsp.after_edit", {
          status: result.status,
          path: result.path,
          ...(result.status === "success"
            ? {
                diagnosticsFound: result.diagnosticCount,
                impactFound: Boolean(result.impact),
                durationMs: result.durationMs,
              }
            : result.status === "error"
              ? { error: result.error, durationMs: result.durationMs }
              : {}),
        });
      }
      const messages = results.map((result) => {
        if (result.status === "skipped")
          return `LSP · skipped · ${result.path}\n  no compatible server or file unavailable`;
        const diagnostics = result.diagnostics
          ? result.diagnostics
              .split("\n")
              .map((line) => `  ${line}`)
              .join("\n")
          : undefined;
        const impact = result.impact
          ? result.impact
              .split("\n")
              .map((line) => `  ${line}`)
              .join("\n")
          : undefined;
        const status = result.status === "error" ? "failed" : "complete";
        const details = [
          result.status === "error" ? `  ${result.error}` : undefined,
          diagnostics,
          impact,
          result.status === "success" &&
          !result.diagnosticCount &&
          !result.impact
            ? "  no diagnostics or impact found"
            : undefined,
        ].filter((message): message is string => Boolean(message));
        return [
          `LSP · ${result.server} · ${status}${result.status === "success" && result.diagnosticCount ? ` · ${result.diagnosticCount} findings` : ""} · ${result.path}`,
          ...details,
        ].join("\n");
      });
      return { action: "continue" as const, message: messages.join("\n") };
    },
  });
  ctx.registerCleanup(async () => {
    await Promise.all(
      [...clients.values()].map(async (client) =>
        (await client).close().catch(() => undefined),
      ),
    );
  });
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
        const client = await getClient(process.cwd(), config);
        await client.sync(file);
        const result = await client.call(
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
