import fs from "node:fs";
import { defineTool, type PluginContext, type ToolArgs } from "@cagent/sdk";
import { errorText } from "./errors";
import { guardPath } from "./guards";
import { recordRead, wasReverted } from "./state";

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 2000;

export function readTool(ctx: PluginContext) {
  return defineTool(
    "read_file",
    "Lê um arquivo com offset e limit de linhas (1-based). Registra o hash do arquivo para detecção de stale e reversão.",
    {
      type: "object",
      properties: {
        path: { type: "string", description: "Caminho do arquivo (relativo ao workspace ou absoluto)" },
        offset: { type: "number", description: "Linha inicial (1-based, default 1)" },
        limit: { type: "number", description: `Linhas a ler (default ${DEFAULT_LIMIT}, máx ${MAX_LIMIT})` },
      },
      required: ["path"],
    },
    async (args: ToolArgs) => {
      const input = String(args.path ?? "");
      let abs: string;
      try {
        abs = guardPath(input);
      } catch (e) {
        return { output: errorText("E_PATH", `${input}: ${e instanceof Error ? e.message : String(e)}`), isError: true };
      }
      let text: string;
      try {
        text = fs.readFileSync(abs, "utf8");
      } catch {
        return { output: errorText("E_NOT_FOUND", input), isError: true };
      }
      if (wasReverted(abs)) ctx.emit("code-tools/reverted", { path: abs });
      recordRead(abs);
      const eol = text.includes("\r\n") ? "\r\n" : "\n";
      const body = text.startsWith("\uFEFF") ? text.slice(1) : text;
      const lines = body.split(eol);
      const offset = Math.max(1, Math.trunc(Number(args.offset ?? 1)));
      const limit = Math.min(MAX_LIMIT, Math.max(1, Math.trunc(Number(args.limit ?? DEFAULT_LIMIT))));
      const slice = lines.slice(offset - 1, offset - 1 + limit);
      const out = slice.map((l, i) => `${offset + i}\t${l}`).join("\n");
      return { output: out || `arquivo vazio (${lines.length} linha(s))` };
    },
  );
}
