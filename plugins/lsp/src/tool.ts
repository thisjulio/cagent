import { defineTool, type PluginContext, type ToolArgs } from "@cagent/sdk";
import fs from "node:fs";
import path from "node:path";
import { createClientPool } from "./client-pool";
import {
  collectDiagnostics,
  preferSingleServer,
} from "./diagnostics-collector";
import { collectImpact } from "./impact-collector";
import { configuredServers, serversForFile } from "./servers";

export function lspTool(ctx: PluginContext) {
  const { getClient, closeAll } = createClientPool();
  const servers = configuredServers(ctx.config.lsp);
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
        changes.map((change) =>
          checkChange(change.path, change, servers, getClient),
        ),
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
      const messages = results.map(formatResult);
      return { action: "continue" as const, message: messages.join("\n") };
    },
  });
  ctx.registerCleanup(() => closeAll());
  return defineTool(
    "lsp",
    "Queries TypeScript, JavaScript, Biome, Python, and Rust language servers. Diagnostics fans out to every matching server.",
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
      const selected = serversForFile(servers, file);
      if (!selected.length) {
        return { output: `ERROR E_LSP_UNSUPPORTED — ${file}`, isError: true };
      }
      try {
        if (String(args.operation) === "diagnostics") {
          const collected = await collectDiagnostics(servers, getClient, file);
          return {
            output: `${collected.names.join("+") || "lsp"} diagnostics ${file}\n${collected.text ?? "no diagnostics"}`,
          };
        }
        const single = preferSingleServer(selected)!;
        const position =
          args.line !== undefined && args.character !== undefined
            ? {
                line: Number(args.line) - 1,
                character: Number(args.character) - 1,
              }
            : undefined;
        const client = await getClient(process.cwd(), single[1]);
        await client.sync(file);
        const result = await client.call(
          String(args.operation),
          file,
          position,
        );
        return {
          output: `${single[0]} ${args.operation} ${file}\n${JSON.stringify(result, null, 2)}`,
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

type CheckChange = { path: string; startLine: number; endLine: number };
type ChangeResult =
  | { path: string; status: "skipped" }
  | {
      path: string;
      status: "success";
      server: string;
      diagnostics?: string;
      diagnosticCount: number;
      impact?: string;
      durationMs: number;
    }
  | {
      path: string;
      status: "error";
      server: string;
      diagnostics?: string;
      diagnosticCount: number;
      impact?: string;
      error: string;
      durationMs: number;
    };

async function checkChange(
  changePath: string,
  change: CheckChange,
  servers: Parameters<typeof collectDiagnostics>[0],
  getClient: Parameters<typeof collectDiagnostics>[1],
): Promise<ChangeResult> {
  const file = path.resolve(changePath);
  if (!serversForFile(servers, file).length || !fs.existsSync(file)) {
    return { path: changePath, status: "skipped" as const };
  }
  const startedAt = performance.now();
  const diagnosticsResult = await collectDiagnostics(
    servers,
    getClient,
    changePath,
  )
    .then((value) => ({ ok: true as const, value }))
    .catch((error) => ({ ok: false as const, error }));
  const impact = await collectImpact(servers, getClient, changePath, change);
  const durationMs = performance.now() - startedAt;
  if (!diagnosticsResult.ok) {
    const reason =
      diagnosticsResult.error instanceof Error
        ? diagnosticsResult.error.message
        : String(diagnosticsResult.error);
    return {
      path: changePath,
      server: serversForFile(servers, file)
        .map(([name]) => name)
        .join("+"),
      status: "error" as const,
      diagnosticCount: 0,
      impact: impact ?? undefined,
      error: reason,
      durationMs,
    };
  }
  return {
    path: changePath,
    server: diagnosticsResult.value.names.join("+") || "lsp",
    status: "success" as const,
    diagnostics: diagnosticsResult.value.text,
    diagnosticCount: diagnosticsResult.value.count,
    impact: impact ?? undefined,
    durationMs,
  };
}

function formatResult(result: ChangeResult): string {
  if (result.status === "skipped")
    return `LSP · skipped · ${result.path}\n  no compatible server or file unavailable`;
  const diagnostics = result.diagnostics
    ?.split("\n")
    .map((line) => `  ${line}`)
    .join("\n");
  const impact = result.impact
    ?.split("\n")
    .map((line) => `  ${line}`)
    .join("\n");
  const status = result.status === "error" ? "failed" : "complete";
  const details = [
    result.status === "error" ? `  ${result.error}` : undefined,
    diagnostics,
    impact,
    result.status === "success" && !result.diagnosticCount && !result.impact
      ? "  no diagnostics or impact found"
      : undefined,
  ].filter((message): message is string => Boolean(message));
  return [
    `LSP · ${result.server} · ${status}${result.status === "success" && result.diagnosticCount ? ` · ${result.diagnosticCount} findings` : ""} · ${result.path}`,
    ...details,
  ].join("\n");
}
