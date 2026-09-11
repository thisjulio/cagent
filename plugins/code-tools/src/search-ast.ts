import fs from "node:fs";
import path from "node:path";
import { Lang, parse } from "@ast-grep/napi";
import fg from "fast-glob";
import { defineTool, type PluginContext, type ToolArgs } from "@cagent/sdk";
import { errorText } from "./errors";
import { gitignorePatterns } from "./gitignore";
import { guardPath } from "./guards";
import { root } from "./state";

const MAX_MATCHES = 200;
const LANGUAGES: Record<string, Lang> = {
  css: Lang.Css,
  cjs: Lang.JavaScript,
  html: Lang.Html,
  javascript: Lang.JavaScript,
  js: Lang.JavaScript,
  jsx: Lang.Tsx,
  cts: Lang.TypeScript,
  mjs: Lang.JavaScript,
  mts: Lang.TypeScript,
  ts: Lang.TypeScript,
  tsx: Lang.Tsx,
  typescript: Lang.TypeScript,
};

function languageFor(file: string, requested?: string): Lang | undefined {
  return LANGUAGES[(requested ?? path.extname(file).slice(1)).toLowerCase()];
}

function filesFor(target: string): string[] {
  if (fs.statSync(target).isFile()) return [target];
  return fg.sync("**/*", {
    cwd: target,
    absolute: true,
    dot: true,
    ignore: gitignorePatterns(root()),
    onlyFiles: true,
  });
}

function searchFiles(files: string[], pattern: string, language: string | undefined, max: number): string[] {
  const matches: string[] = [];
  for (const file of files) {
    const lang = languageFor(file, language);
    if (!lang) continue;
    const source = fs.readFileSync(file, "utf8");
    for (const node of parse(lang, source).root().findAll(pattern)) {
      const position = node.range().start;
      const relative = path.relative(root(), file) || path.basename(file);
      matches.push(`${relative}:${position.line + 1}:${position.column + 1}: ${node.text()}`);
      if (matches.length >= max) return matches;
    }
  }
  return matches;
}

export function searchAstTool(ctx: PluginContext) {
  return defineTool(
    "search_ast",
    "Busca código por padrão AST com metavariáveis (ex.: console.log($X)).",
    {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Padrão AST (ex.: console.log($X))" },
        lang: { type: "string", description: "Linguagem (ts, js, tsx, html, css); opcional, inferida da extensão" },
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
      const language = typeof args.lang === "string" && args.lang ? args.lang : undefined;
      if (language && !LANGUAGES[language.toLowerCase()]) {
        return { output: errorText("E_LANG", `${language}: linguagem não suportada`), isError: true };
      }
      let abs: string;
      try {
        abs = guardPath(target);
      } catch (e) {
        return { output: errorText("E_PATH", `${target}: ${e instanceof Error ? e.message : String(e)}`), isError: true };
      }
      try {
        return { output: searchFiles(filesFor(abs), pattern, language, max).join("\n") || "sem resultados" };
      } catch (e) {
        return { output: errorText("E_SEARCH", `${target}: ${e instanceof Error ? e.message : String(e)}`), isError: true };
      }
    },
  );
}
