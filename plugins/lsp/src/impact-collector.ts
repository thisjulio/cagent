import fs from "node:fs";
import path from "node:path";
import { serversForFile } from "./servers";
import type { LspServerConfig } from "./types";
import type { GetClient } from "./client-pool";
import { withTimeout } from "./with-timeout";

const IMPACT_TIMEOUT_MS = 6000;
const MAX_SYMBOLS = 12;
const MAX_FILES = 20;
const MAX_REFS = 10;

type SymbolItem = {
  name?: string;
  range?: { start?: { line?: number }; end?: { line?: number } };
  selectionRange?: { start?: { line?: number } };
  children?: SymbolItem[];
};

type RefItem = {
  uri?: string;
  range?: { start?: { line?: number } };
};

export async function collectImpact(
  servers: Record<string, LspServerConfig>,
  getClient: GetClient,
  input: string,
  changedRange?: { startLine: number; endLine: number },
): Promise<string | undefined> {
  try {
    return await withTimeout(
      collectImpactInner(servers, getClient, input, changedRange),
      IMPACT_TIMEOUT_MS,
      "LSP impact timed out",
    );
  } catch {
    // ponytail: impact is best-effort; diagnostics still reach the user.
    return undefined;
  }
}

async function collectImpactInner(
  servers: Record<string, LspServerConfig>,
  getClient: GetClient,
  input: string,
  changedRange?: { startLine: number; endLine: number },
): Promise<string | undefined> {
  const file = path.resolve(input);
  const selected = serversForFile(servers, file);
  const preferred =
    selected.find(([name]) => name === "typescript") ?? selected[0];
  if (!preferred || !fs.existsSync(file)) return undefined;
  const client = await getClient(process.cwd(), preferred[1]);
  await client.sync(file);
  const symbols = (await client.call("documentSymbol", file)) as SymbolItem[];
  const candidates = filterCandidates(symbols, changedRange);
  const entries: string[] = [];
  const files = new Set<string>();
  for (const symbol of candidates) {
    if (files.size >= MAX_FILES) break;
    const position = {
      line: symbol.selectionRange!.start!.line!,
      character: 0,
    };
    const refs = (await client.call("references", file, position)) as RefItem[];
    const relevant = refs
      .filter((ref) => ref.uri && ref.uri !== `file://${file}`)
      .slice(0, MAX_REFS);
    if (!relevant.length) continue;
    entries.push(`${symbol.name}: ${formatRefs(relevant)}`);
    for (const ref of relevant) if (ref.uri) files.add(ref.uri);
  }
  return entries.length
    ? `LSP impact (${entries.length} symbols, capped):\n${entries.join("\n")}`
    : undefined;
}

function filterCandidates(
  symbols: SymbolItem[],
  changedRange?: { startLine: number; endLine: number },
): SymbolItem[] {
  return symbols
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
    .slice(0, MAX_SYMBOLS);
}

function formatRefs(refs: RefItem[]): string {
  return refs
    .map((ref) => {
      const refFile = decodeURIComponent(ref.uri!.replace(/^file:\/\//, ""));
      return `${path.relative(process.cwd(), refFile)}:${(ref.range?.start?.line ?? 0) + 1}`;
    })
    .join(", ");
}
