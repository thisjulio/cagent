import fs from "node:fs";
import path from "node:path";
import { Lang, parse } from "@ast-grep/napi";
import { Glob } from "bun";
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

function evidenceFromOutput(output: string) {
  return output
    .split("\n")
    .map((line) => {
      const match = line.match(/^(.+?):(\d+):/);
      return match
        ? { path: match[1], line: Number(match[2]), kind: "code" as const }
        : undefined;
    })
    .filter((item): item is { path: string; line: number; kind: "code" } =>
      Boolean(item),
    );
}

function filesFor(target: string): string[] {
  if (fs.statSync(target).isFile()) return [target];
  const ignored = gitignorePatterns(root()).map((pattern) => new Glob(pattern));
  return [
    ...new Glob("**/*").scanSync({ cwd: target, absolute: true, dot: true }),
  ]
    .filter((file) => !ignored.some((glob) => glob.match(file)))
    .filter((file) => fs.statSync(file).isFile());
}

function searchFiles(
  files: string[],
  pattern: string,
  language: string | undefined,
  max: number,
): string[] {
  const matches: string[] = [];
  for (const file of files) {
    const lang = languageFor(file, language);
    if (!lang) continue;
    const source = fs.readFileSync(file, "utf8");
    for (const node of parse(lang, source).root().findAll(pattern)) {
      const position = node.range().start;
      const relative = path.relative(root(), file) || path.basename(file);
      matches.push(
        `${relative}:${position.line + 1}:${position.column + 1}: ${node.text()}`,
      );
      if (matches.length >= max) return matches;
    }
  }
  return matches;
}

export function searchAstTool(ctx: PluginContext) {
  return defineTool(
    "search_ast",
    "Searches code by AST pattern with metavariables (for example, console.log($X)).",
    {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "AST pattern (for example, console.log($X))",
        },
        lang: {
          type: "string",
          description:
            "Language (ts, js, tsx, html, css); optional, inferred from the extension",
        },
        target: {
          type: "string",
          description: "File or directory (default: workspace)",
        },
        max_matches: {
          type: "number",
          description: `Max matches (default ${MAX_MATCHES})`,
        },
      },
      required: ["pattern"],
    },
    async (args: ToolArgs) => {
      const pattern = String(args.pattern ?? "");
      if (!pattern)
        return { output: errorText("E_PARSE", "empty pattern"), isError: true };
      const target = String(args.target ?? ".");
      const max = Math.min(
        MAX_MATCHES,
        Math.max(1, Math.trunc(Number(args.max_matches ?? MAX_MATCHES))),
      );
      const language =
        typeof args.lang === "string" && args.lang ? args.lang : undefined;
      if (language && !LANGUAGES[language.toLowerCase()]) {
        return {
          output: errorText("E_LANG", `${language}: unsupported language`),
          isError: true,
        };
      }
      let abs: string;
      try {
        abs = guardPath(target);
      } catch (e) {
        return {
          output: errorText(
            "E_PATH",
            `${target}: ${e instanceof Error ? e.message : String(e)}`,
          ),
          isError: true,
        };
      }
      try {
        const output =
          searchFiles(filesFor(abs), pattern, language, max).join("\n") ||
          "no results";
        return { output, evidence: evidenceFromOutput(output) };
      } catch (e) {
        return {
          output: errorText(
            "E_SEARCH",
            `${target}: ${e instanceof Error ? e.message : String(e)}`,
          ),
          isError: true,
        };
      }
    },
    { readOnly: true },
  );
}
