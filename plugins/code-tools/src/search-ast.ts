import { defineTool, type PluginContext, type ToolArgs } from "@cagent/sdk";
import { errorText } from "./errors";
import { runCmd } from "./exec";
import { guardPath } from "./guards";
import { root } from "./state";

const MAX_MATCHES = 200;

export function searchAstTool(ctx: PluginContext) {
  return defineTool(
    "search_ast",
    "Busca código por padrão AST com metavariáveis (ex.: console.log($X)). Usa @ast-grep/cli.",
    {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Padrão AST (ex.: console.log($X))" },
        lang: { type: "string", description: "Linguagem (ts, js, py, go, rs...); opcional, inferida da extensão" },
        target: { type: "string", description: "Arquivo ou diretório (default: workspace)" },
        max_matches: { type: "number", description: `Máx. (default ${MAX_MATCHES})` },
      },
      required: ["pattern"],
    },
    async (args: ToolArgs) => {
      const pattern = String(args.pattern ?? "");
      if (!pattern) return { output: errorText("E_PARSE", "pattern vazio"), isError: true };
      const target = String(args.target ?? ".");
      const max = Math.min(MAX_MATCHES, Math.max(1, Math.trunc(Number(args.max_matches ?? MAX_MATCHES))));
      let abs: string;
      try {
        abs = guardPath(target);
      } catch (e) {
        return { output: errorText("E_PATH", `${target}: ${e instanceof Error ? e.message : String(e)}`), isError: true };
      }
      const argv = ["run", "-p", pattern];
      if (typeof args.lang === "string" && args.lang) argv.push("-l", String(args.lang));
      argv.push(abs);
      const r = await runCmd("bun", ["x", "@ast-grep/cli", ...argv], { cwd: root(), timeoutMs: 120_000 });
      if (r.code !== 0 && r.code !== 1) {
        return { output: errorText("E_SEARCH", `${target}: ${r.stderr.slice(0, 400)}`), isError: true };
      }
      const lines = r.stdout.split("\n").filter((l) => l.trim());
      return { output: lines.slice(0, max).join("\n") || "sem resultados" };
    },
  );
}
