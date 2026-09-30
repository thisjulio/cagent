import path from "node:path";
import { Lang, parse, type SgNode } from "@ast-grep/napi";

export type Definition = { name: string; line: number; signature: string };
export type FileSymbols = {
  file: string;
  definitions: Definition[];
  references: string[];
  imports: string[];
};

const languages: Record<string, Lang> = {
  ".ts": Lang.TypeScript,
  ".tsx": Lang.Tsx,
  ".mts": Lang.TypeScript,
  ".cts": Lang.TypeScript,
  ".js": Lang.JavaScript,
  ".jsx": Lang.Tsx,
  ".mjs": Lang.JavaScript,
  ".cjs": Lang.JavaScript,
};
const declarations = new Set([
  "function_declaration",
  "class_declaration",
  "interface_declaration",
  "type_alias_declaration",
  "enum_declaration",
  "method_definition",
]);

export function supported(file: string): boolean {
  return Boolean(languages[path.extname(file)]);
}

function definition(node: SgNode): Definition | undefined {
  const value = node.field("value");
  const callable =
    node.kind() === "variable_declarator" &&
    (value?.kind() === "arrow_function" ||
      value?.kind() === "function_expression");
  if (!declarations.has(String(node.kind())) && !callable) return;
  const name = node.field("name");
  if (!name || !/^[\w$]+$/.test(name.text())) return;
  const body = (callable ? value : node)?.field("body");
  let signature = node.text();
  if (body)
    signature = Buffer.from(signature)
      .subarray(0, body.range().start.index - node.range().start.index)
      .toString("utf8");
  else if (node.kind() === "type_alias_declaration")
    signature = `type ${name.text()}`;
  signature = signature.replace(/\s+/g, " ").trim();
  return {
    name: name.text(),
    line: node.range().start.line + 1,
    signature: signature.slice(0, 300),
  };
}

export function extract(file: string, source: string): FileSymbols {
  const language = languages[path.extname(file)];
  const result: FileSymbols = {
    file,
    definitions: [],
    references: [],
    imports: [],
  };
  if (!language) return result;
  const stack = [parse(language, source).root()];
  while (stack.length) {
    const node = stack.pop()!;
    const found = definition(node);
    if (found) result.definitions.push(found);
    if (node.kind() === "identifier" || node.kind() === "type_identifier") {
      if (node.parent()?.field("name")?.id() !== node.id())
        result.references.push(node.text());
    }
    if (
      node.kind() === "import_statement" ||
      node.kind() === "export_statement"
    ) {
      const imported = node.field("source");
      if (imported) result.imports.push(imported.text().slice(1, -1));
    }
    stack.push(...node.children().reverse());
  }
  return result;
}
