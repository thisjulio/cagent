import fs from "node:fs";
import path from "node:path";
import { serversForFile } from "./servers";
import type { LspServerConfig } from "./types";
import type { GetClient } from "./client-pool";

type DiagnosticItem = {
  range?: { start?: { line?: number; character?: number } };
  message?: string;
  severity?: number;
};

export async function collectDiagnostics(
  servers: Record<string, LspServerConfig>,
  getClient: GetClient,
  input: string,
): Promise<{
  text?: string;
  count: number;
  names: string[];
  errors: string[];
}> {
  const file = path.resolve(input);
  const selected = serversForFile(servers, file);
  if (!selected.length || !fs.existsSync(file))
    return { count: 0, names: [], errors: [] };

  const settled = await Promise.allSettled(
    selected.map(async ([name, config]) => {
      const client = await getClient(process.cwd(), config);
      await client.sync(file);
      const diagnostics = (await client.call(
        "diagnostics",
        file,
      )) as DiagnosticItem[];
      const lines = diagnostics.map((diagnostic) => {
        const line = (diagnostic.range?.start?.line ?? 0) + 1;
        const character = (diagnostic.range?.start?.character ?? 0) + 1;
        const message = diagnostic.message ?? "LSP diagnostic";
        return `${path.relative(process.cwd(), file)}:${line}:${character} [${name}] ${message}`;
      });
      return { name, lines };
    }),
  );

  const fulfilled = settled.filter(
    (
      result,
    ): result is PromiseFulfilledResult<{ name: string; lines: string[] }> =>
      result.status === "fulfilled",
  );
  const errors = settled
    .map((result, index) =>
      result.status === "rejected"
        ? `${selected[index][0]}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`
        : undefined,
    )
    .filter((message): message is string => Boolean(message));
  if (!fulfilled.length) {
    const first = settled.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    throw first ? first.reason : new Error("LSP diagnostics failed");
  }

  const lines = fulfilled.flatMap((result) => result.value.lines);
  const names = fulfilled.map((result) => result.value.name);
  if (!lines.length) return { count: 0, names, errors };
  return { count: lines.length, text: lines.join("\n"), names, errors };
}

export function preferSingleServer(
  selected: Array<[string, LspServerConfig]>,
): [string, LspServerConfig] | undefined {
  if (!selected.length) return undefined;
  return selected.find(([name]) => name === "typescript") ?? selected[0];
}
