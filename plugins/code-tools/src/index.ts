import fs from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import { defineTool, type Plugin, type ToolArgs } from "@cagent/sdk";

const MAX_MATCHES = 200;
const MAX_FILES = 500;

// ponytail: conversão gitignore→glob sem negação (!); negações entram quando o agente se deparar com elas
function gitignorePatterns(cwd: string): string[] {
  const file = path.join(cwd, ".gitignore");
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      if (l.endsWith("/")) return `**/${l.replace(/\/$/, "")}/**`;
      if (l.startsWith("/")) return l.slice(1);
      if (l.includes("/")) return l;
      return `**/${l}`;
    });
}

// ponytail: boilerplate mínimo por linguagem; ampliar quando o agente pedir mais formatos
const TEMPLATES: Record<string, (name: string) => string> = {
  ts: (n) => `export function ${n}() {\n  // TODO\n}\n`,
  js: (n) => `function ${n}() {\n  // TODO\n}\n\nmodule.exports = ${n};\n`,
  py: (n) => `def ${n}():\n    ...\n`,
  go: (n) => `package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("${n}")\n}\n`,
  rs: (n) => `fn main() {\n    println!("${n}");\n}\n`,
};

function symbolName(p: string): string {
  const base = path.basename(p).replace(/\.[^.]+$/, "");
  const parts = base.split(/[-_]/);
  return parts.map((s, i) => (i === 0 ? s : s[0].toUpperCase() + s.slice(1))).join("");
}

const register: Plugin = (ctx) => {
  ctx.registerTool(
    defineTool(
      "search_files",
      "Busca código por glob + regex em arquivos do projeto (respeita .gitignore). Retorna 'caminho:linha: texto'.",
      {
        type: "object",
        properties: {
          pattern: { type: "string", description: "Glob de arquivos (default: **/*)" },
          regex: { type: "string", description: "Regex (case-insensitive) para casar linhas (default: vazio)" },
          max_matches: { type: "number", description: `Máx. de correspondências (default: ${MAX_MATCHES})` },
        },
      },
      async (args: ToolArgs) => {
        const pattern = String(args.pattern ?? "**/*");
        const regexStr = String(args.regex ?? "");
        const max = typeof args.max_matches === "number" ? Math.min(args.max_matches, MAX_MATCHES) : MAX_MATCHES;
        const cwd = process.cwd();

        const files = fg.sync(pattern, { cwd, ignore: gitignorePatterns(cwd), onlyFiles: true }).slice(0, MAX_FILES);
        const re = regexStr ? new RegExp(regexStr, "i") : null;
        const matches: string[] = [];
        for (const file of files) {
          let text: string;
          try {
            const buf = fs.readFileSync(path.join(cwd, file));
            if (buf.includes(0)) continue; // binário
            text = buf.toString("utf8");
          } catch {
            continue;
          }
          const lines = text.split("\n");
          for (let i = 0; i < lines.length; i++) {
            if (re && !re.test(lines[i])) continue;
            const line = lines[i].trim();
            if (!line) continue;
            matches.push(`${file}:${i + 1}: ${line}`);
            if (matches.length >= max) return { output: matches.join("\n") };
          }
        }
        return { output: matches.length ? matches.join("\n") : "sem resultados" };
      },
    ),
  );

  ctx.registerTool(
    defineTool(
      "edit_file",
      "Edição line-based: substitui as linhas start_line..end_line (1-based) do arquivo por content.",
      {
        type: "object",
        properties: {
          path: { type: "string", description: "Caminho do arquivo (relativo ou absoluto)" },
          start_line: { type: "number", description: "Primeira linha a substituir (1-based)" },
          end_line: { type: "number", description: "Última linha a substituir (default: start_line)" },
          content: { type: "string", description: "Novo conteúdo (pode ter múltiplas linhas)" },
        },
        required: ["path", "start_line", "content"],
      },
      async (args: ToolArgs) => {
        const file = path.resolve(String(args.path));
        const start = Math.trunc(Number(args.start_line));
        const end = Math.trunc(Number(args.end_line ?? args.start_line));
        if (!Number.isInteger(start) || start < 1) return { output: "start_line deve ser inteiro >= 1", isError: true };
        if (!Number.isInteger(end) || end < start) return { output: "end_line deve ser >= start_line", isError: true };

        let text: string;
        try {
          text = fs.readFileSync(file, "utf8");
        } catch (e) {
          return { output: `não consegui ler ${file}: ${e instanceof Error ? e.message : String(e)}`, isError: true };
        }
        const lines = text.split("\n");
        if (start > lines.length) return { output: `start_line ${start} fora do arquivo (${lines.length} linhas)`, isError: true };

        const next = [...lines.slice(0, start - 1), ...String(args.content).split("\n"), ...lines.slice(end)];
        fs.writeFileSync(file, next.join("\n"));
        return { output: `editado ${file}: linhas ${start}..${end} → ${String(args.content).split("\n").length} linha(s)` };
      },
    ),
  );

  ctx.registerTool(
    defineTool(
      "scaffold",
      "Cria um arquivo com boilerplate da linguagem informada (ts, js, py, go, rs).",
      {
        type: "object",
        properties: {
          language: { type: "string", description: "ts | js | py | go | rs" },
          path: { type: "string", description: "Caminho do arquivo a criar" },
        },
        required: ["language", "path"],
      },
      async (args: ToolArgs) => {
        const lang = String(args.language);
        const file = path.resolve(String(args.path));
        const template = TEMPLATES[lang];
        if (!template) return { output: `linguagem não suportada: ${lang} (suportadas: ${Object.keys(TEMPLATES).join(", ")})`, isError: true };
        fs.mkdirSync(path.dirname(file), { recursive: true });
        const content = template(symbolName(file));
        fs.writeFileSync(file, content);
        return { output: `criado ${file}:\n${content}` };
      },
    ),
  );

  ctx.promptSection(
    "code-tools",
    "Ferramentas de código disponíveis: use search_files (glob + regex, respeita .gitignore) para localizar código; use edit_file com números de linha exatos (1-based) para editar; use scaffold para criar boilerplate (ts, js, py, go, rs). Antes de editar, localize as linhas com search_files.",
  );
};

export default register;
