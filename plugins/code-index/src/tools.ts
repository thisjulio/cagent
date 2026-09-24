import fs from "node:fs/promises";
import path from "node:path";
import { defineTool, type ToolArgs } from "@cagent/sdk";
import type { CodeIndex } from "./store";

async function safePath(input: string): Promise<string> {
  const root = path.resolve(process.cwd());
  const file = path.resolve(root, input);
  if (file !== root && !file.startsWith(`${root}${path.sep}`))
    throw new Error("path is outside the workspace");
  const realRoot = await fs.realpath(root);
  const realFile = await fs.realpath(file);
  if (realFile !== realRoot && !realFile.startsWith(`${realRoot}${path.sep}`))
    throw new Error("path resolves outside the workspace");
  return path.relative(root, file).split(path.sep).join("/");
}

async function lines(file: string): Promise<string[]> {
  return (await fs.readFile(file, "utf8")).replace(/\r\n/g, "\n").split("\n");
}

export function codeIndexTools(index: CodeIndex) {
  const outline = defineTool(
    "outline",
    "Lists definitions and signatures in one workspace file using a local syntax index.",
    {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
    async (args: ToolArgs) => {
      try {
        const file = await safePath(String(args.path ?? ""));
        const tags = await index.tags(file);
        return {
          output: tags.length
            ? tags
                .map(
                  (tag) =>
                    `${tag.line}\t${tag.scope.length ? `${tag.scope.join(".")}.` : ""}${tag.name}\t${tag.kind}\t${tag.signature}`,
                )
                .join("\n")
            : "No indexed symbols found.",
          evidence: tags.map((tag) => ({
            path: file,
            symbol: tag.name,
            line: tag.line,
            kind: "code" as const,
          })),
        };
      } catch (error) {
        return { output: `ERROR: ${String(error)}`, isError: true };
      }
    },
    { readOnly: true },
  );

  const readSymbol = defineTool(
    "read_symbol",
    "Reads a symbol's source lines from a file. Output uses read_file line metadata format; call read_file again before any edit.",
    {
      type: "object",
      properties: {
        path: { type: "string" },
        name: { type: "string" },
      },
      required: ["path", "name"],
    },
    async (args: ToolArgs) => {
      try {
        const file = await safePath(String(args.path ?? ""));
        const name = String(args.name ?? "");
        const tags = await index.tags(file);
        const matches = tags.filter((item) => item.name === name);
        if (matches.length === 0)
          return { output: `Symbol not found: ${name}`, isError: true };
        if (matches.length > 1)
          return {
            output: `Ambiguous symbol ${name}; matching lines: ${matches.map((item) => item.line).join(", ")}. Use outline and select a unique file or symbol name.`,
            isError: true,
          };
        const tag = matches[0]!;
        const source = await lines(file);
        const start = Math.max(1, tag.line);
        const end = Math.min(source.length, Math.max(start, tag.endLine));
        const body = source
          .slice(start - 1, end)
          .map((line, offset) => `${start + offset}\t${line}`)
          .join("\n");
        return {
          output: `startLine=${start} | endLine=${end} | totalLines=${source.length} | hasMore=false | nextOffset=none\n${body}`,
          evidence: [{ path: file, symbol: name, line: start, kind: "code" }],
        };
      } catch (error) {
        return { output: `ERROR: ${String(error)}`, isError: true };
      }
    },
    { readOnly: true },
  );

  const findRefs = defineTool(
    "find_refs",
    "Finds textual identifier occurrences by exact name across supported workspace files. Results are approximate, not semantic references; use lsp references when precision matters. Supports limit and offset pagination.",
    {
      type: "object",
      properties: {
        name: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 200 },
        offset: { type: "integer", minimum: 0 },
      },
      required: ["name"],
    },
    async (args: ToolArgs) => {
      const name = String(args.name ?? "").trim();
      if (!/^[\w$]+$/.test(name))
        return { output: "Name must be an identifier.", isError: true };
      const limit = Math.min(
        200,
        Math.max(1, Math.trunc(Number(args.limit) || 100)),
      );
      const offset = Math.max(0, Math.trunc(Number(args.offset) || 0));
      const hits: string[] = [];
      const end = offset + limit;
      for (const file of await index.files()) {
        if (hits.length >= end) break;
        try {
          const source = await fs.readFile(
            path.resolve(process.cwd(), file),
            "utf8",
          );
          const expression = new RegExp(
            `(^|[^\\w$])${name.replace(/[$]/g, "\\$&")}([^\\w$]|$)`,
          );
          const sourceLines = source.split(/\r?\n/);
          for (let i = 0; i < sourceLines.length; i++) {
            const line = sourceLines[i]!;
            if (!expression.test(line)) continue;
            hits.push(`${file}:${i + 1}\t${line.trim()}`);
            if (hits.length >= end + 1) break;
          }
        } catch {
          // Ignore files that cannot be read.
        }
      }
      const page = hits.slice(offset, offset + limit);
      const output = page.join("\n");
      return {
        output: output
          ? `${output}${hits.length > offset + page.length ? `\nMore results available; use offset=${offset + page.length}.` : ""}`
          : `No occurrences found for ${name}.`,
      };
    },
    { readOnly: true },
  );

  return [outline, readSymbol, findRefs];
}
