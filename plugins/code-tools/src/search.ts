import fs from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import { defineTool, type PluginContext, type ToolArgs } from "@cagent/sdk";
import { errorText } from "./errors";
import { runCmd } from "./exec";
import { gitignorePatterns } from "./gitignore";
import { guardPath } from "./guards";
import { root } from "./state";

const MAX_MATCHES = 200;
const RG_BIN = "/usr/bin/rg";

async function rgSearch(pattern: string, abs: string, max: number): Promise<string | null> {
  const ROOT = root();
  const r = await runCmd(RG_BIN, ["-n", "--color=never", pattern, abs], { cwd: ROOT, timeoutMs: 30_000 });
  if (r.code !== 0 && r.code !== 1) return null;
  const lines = r.stdout.split("\n").filter((l) => l.length > 0);
  return lines.slice(0, max).join("\n") || "sem resultados";
}

// ponytail: fallback JS com .gitignore sem negações; rg é o caminho padrão
async function jsSearch(pattern: string, abs: string, max: number): Promise<string> {
  const ROOT = root();
  const re = new RegExp(pattern, "i");
  const files = fg.sync(path.relative(ROOT, abs), { cwd: ROOT, ignore: gitignorePatterns(ROOT), onlyFiles: true });
  const matches: string[] = [];
  for (const file of files) {
    let text: string;
    try {
      const buf = fs.readFileSync(path.join(ROOT, file));
      if (buf.includes(0)) continue;
      text = buf.toString("utf8");
    } catch {
      continue;
    }
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (!re.test(lines[i])) continue;
      matches.push(`${file}:${i + 1}: ${lines[i].trim()}`);
      if (matches.length >= max) return matches.join("\n");
    }
  }
  return matches.length ? matches.join("\n") : "sem resultados";
}

export function searchTool(ctx: PluginContext) {
  return defineTool(
    "search",
    "Busca regex em arquivos do workspace (rg quando disponível, fallback JS; respeita .gitignore). Retorna 'caminho:linha: texto'.",
    {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Regex (case-insensitive)" },
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
      if (fs.existsSync(RG_BIN)) {
        const out = await rgSearch(pattern, abs, max);
        if (out) return { output: out };
      }
      try {
        return { output: await jsSearch(pattern, abs, max) };
      } catch (e) {
        return { output: errorText("E_PARSE", `${target}: ${e instanceof Error ? e.message : String(e)}`), isError: true };
      }
    },
  );
}
