import path from "node:path";
import { Language, Parser, Query, type Node } from "web-tree-sitter";
import runtimeWasm from "web-tree-sitter/tree-sitter.wasm" with {
  type: "file",
};
import grammarC from "tree-sitter-wasms/out/tree-sitter-c.wasm" with {
  type: "file",
};
import grammarCpp from "tree-sitter-wasms/out/tree-sitter-cpp.wasm" with {
  type: "file",
};
import grammarCss from "tree-sitter-wasms/out/tree-sitter-css.wasm" with {
  type: "file",
};
import grammarGo from "tree-sitter-wasms/out/tree-sitter-go.wasm" with {
  type: "file",
};
import grammarHtml from "tree-sitter-wasms/out/tree-sitter-html.wasm" with {
  type: "file",
};
import grammarJava from "tree-sitter-wasms/out/tree-sitter-java.wasm" with {
  type: "file",
};
import grammarJavascript from "tree-sitter-wasms/out/tree-sitter-javascript.wasm" with {
  type: "file",
};
import grammarJson from "tree-sitter-wasms/out/tree-sitter-json.wasm" with {
  type: "file",
};
import grammarPython from "tree-sitter-wasms/out/tree-sitter-python.wasm" with {
  type: "file",
};
import grammarRust from "tree-sitter-wasms/out/tree-sitter-rust.wasm" with {
  type: "file",
};
import grammarToml from "tree-sitter-wasms/out/tree-sitter-toml.wasm" with {
  type: "file",
};
import grammarTsx from "tree-sitter-wasms/out/tree-sitter-tsx.wasm" with {
  type: "file",
};
import grammarTypescript from "tree-sitter-wasms/out/tree-sitter-typescript.wasm" with {
  type: "file",
};

export type SymbolTag = {
  name: string;
  kind: string;
  scope: string[];
  file: string;
  isLocal?: boolean;
  line: number;
  endLine: number;
  signature: string;
  isDef: true;
};

let parser: Parser | undefined;
let initialized: Promise<Parser> | undefined;
const languages = new Map<string, Promise<Language>>();
let parseQueue: Promise<void> = Promise.resolve();
const grammarFiles: Record<string, string> = {
  typescript: grammarTypescript,
  tsx: grammarTsx,
  javascript: grammarJavascript,
  python: grammarPython,
  rust: grammarRust,
  go: grammarGo,
  java: grammarJava,
  c: grammarC,
  cpp: grammarCpp,
  css: grammarCss,
  html: grammarHtml,
  json: grammarJson,
  toml: grammarToml,
};

async function getParser(): Promise<Parser> {
  initialized ??= Parser.init({
    locateFile: () => runtimeWasm,
  }).then(() => (parser = new Parser()));
  return initialized;
}

async function getLanguage(name: string): Promise<Language> {
  await getParser();
  let language = languages.get(name);
  if (!language) {
    const grammar = grammarFiles[name];
    if (!grammar) throw new Error(`unsupported grammar: ${name}`);
    language = Language.load(grammar);
    languages.set(name, language);
  }
  return language;
}

const queries: Record<string, string> = {
  typescript:
    "(function_declaration name: (identifier) @name) @definition\n(function_signature name: (identifier) @name) @definition\n(class_declaration name: (type_identifier) @name) @definition\n(interface_declaration name: (type_identifier) @name) @definition\n(type_alias_declaration name: (type_identifier) @name) @definition\n(enum_declaration name: (identifier) @name) @definition\n(method_definition name: (property_identifier) @name) @definition\n(public_field_definition name: (property_identifier) @name) @definition\n(variable_declarator name: (identifier) @name) @definition\n(internal_module name: (identifier) @name) @definition",
  tsx: "(function_declaration name: (identifier) @name) @definition\n(class_declaration name: (type_identifier) @name) @definition\n(interface_declaration name: (type_identifier) @name) @definition\n(type_alias_declaration name: (type_identifier) @name) @definition\n(method_definition name: (property_identifier) @name) @definition\n(variable_declarator name: (identifier) @name) @definition",
  javascript:
    "(function_declaration name: (identifier) @name) @definition\n(class_declaration name: (identifier) @name) @definition\n(method_definition name: (property_identifier) @name) @definition\n(method_definition name: (private_property_identifier) @name) @definition\n(variable_declarator name: (identifier) @name value: [(function_expression) (arrow_function)]) @definition\n(pair key: (property_identifier) @name value: [(function_expression) (arrow_function)]) @definition\n(assignment_expression left: (member_expression property: (property_identifier) @name) right: [(function_expression) (arrow_function)]) @definition\n(variable_declarator name: (identifier) @name) @definition\n(field_definition property: (property_identifier) @name) @definition\n(field_definition property: (private_property_identifier) @name) @definition",
  python:
    "(function_definition name: (identifier) @name) @definition\n(class_definition name: (identifier) @name) @definition\n(assignment left: (identifier) @name) @definition",
  rust: [
    "(function_item name: (identifier) @name) @definition",
    "(struct_item name: (type_identifier) @name) @definition",
    "(struct_item body: (field_declaration_list (field_declaration name: (field_identifier) @name))) @definition",
    "(enum_item name: (type_identifier) @name) @definition",
    "(enum_variant name: (identifier) @name) @definition",
    "(trait_item name: (type_identifier) @name) @definition",
    "(impl_item type: (_) @name) @definition",
    "(type_item name: (type_identifier) @name) @definition",
    "(const_item name: (identifier) @name) @definition",
    "(static_item name: (identifier) @name) @definition",
    "(mod_item name: (identifier) @name) @definition",
  ].join("\n"),
  go: "(function_declaration name: (identifier) @name) @definition\n(method_declaration name: (field_identifier) @name) @definition\n(type_declaration (type_spec name: (type_identifier) @name)) @definition\n(type_declaration (type_alias name: (type_identifier) @name)) @definition\n(var_spec name: (identifier) @name) @definition\n(const_spec name: (identifier) @name) @definition\n(field_declaration name: (field_identifier) @name) @definition",
  java: "(class_declaration name: (identifier) @name) @definition\n(method_declaration name: (identifier) @name) @definition\n(interface_declaration name: (identifier) @name) @definition\n(enum_declaration name: (identifier) @name) @definition\n(record_declaration name: (identifier) @name) @definition\n(annotation_type_declaration name: (identifier) @name) @definition\n(field_declaration declarator: (variable_declarator name: (identifier) @name)) @definition\n(enum_constant name: (identifier) @name) @definition\n(constant_declaration declarator: (variable_declarator name: (identifier) @name)) @definition",
  c: "(function_definition declarator: (function_declarator declarator: (identifier) @name)) @definition\n(struct_specifier name: (type_identifier) @name) @definition\n(type_definition declarator: (type_identifier) @name) @definition\n(enum_specifier name: (type_identifier) @name) @definition\n(enumerator name: (identifier) @name) @definition\n(preproc_def name: (identifier) @name) @definition\n(preproc_function_def name: (identifier) @name) @definition\n(declaration declarator: (init_declarator declarator: (identifier) @name)) @definition\n(declaration declarator: (identifier) @name) @definition\n(declaration declarator: (function_declarator declarator: (identifier) @name)) @definition",
  cpp: "(function_definition declarator: (function_declarator declarator: (identifier) @name)) @definition\n(function_definition declarator: (function_declarator declarator: (field_identifier) @name)) @definition\n(class_specifier name: (type_identifier) @name) @definition\n(struct_specifier name: (type_identifier) @name) @definition\n(enum_specifier name: (type_identifier) @name) @definition\n(enumerator name: (identifier) @name) @definition\n(alias_declaration name: (type_identifier) @name) @definition\n(namespace_definition name: (namespace_identifier) @name) @definition\n(field_declaration declarator: (field_identifier) @name) @definition\n(preproc_def name: (identifier) @name) @definition\n(preproc_function_def name: (identifier) @name) @definition\n(declaration declarator: (init_declarator declarator: (identifier) @name)) @definition\n(declaration declarator: (identifier) @name) @definition\n(declaration declarator: (function_declarator declarator: (identifier) @name)) @definition\n(type_definition declarator: (type_identifier) @name) @definition\n(union_specifier name: (type_identifier) @name) @definition\n(field_declaration declarator: (function_declarator declarator: (_) @name)) @definition\n(declaration declarator: (function_declarator declarator: (_) @name)) @definition\n(function_definition declarator: (function_declarator declarator: (_) @name)) @definition\n(class_specifier name: (template_type name: (type_identifier) @name)) @definition\n(struct_specifier name: (template_type name: (type_identifier) @name)) @definition\n(function_definition declarator: (function_declarator declarator: (template_function name: (identifier) @name))) @definition",
  css: "(rule_set (selectors) @name) @definition\n(rule_set (selectors [(class_selector) (id_selector) (descendant_selector)] @name)) @definition",
  html: "(element (start_tag (tag_name) @name)) @definition",
  json: "(pair key: (string) @name) @definition",
  toml: "(pair (bare_key) @name) @definition\n(table (bare_key) @name) @definition",
};

const kinds: Record<string, Record<string, string>> = {
  typescript: {
    function_declaration: "f",
    function_signature: "f",
    class_declaration: "c",
    interface_declaration: "i",
    type_alias_declaration: "t",
    enum_declaration: "g",
    method_definition: "m",
    public_field_definition: "m",
    variable_declarator: "v",
    internal_module: "n",
  },
  tsx: {
    function_declaration: "f",
    class_declaration: "c",
    interface_declaration: "i",
    type_alias_declaration: "t",
    method_definition: "m",
    variable_declarator: "v",
  },
  javascript: {
    function_declaration: "f",
    class_declaration: "c",
    method_definition: "m",
    function_expression: "f",
    arrow_function: "f",
    pair: "m",
    assignment_expression: "f",
    field_definition: "m",
    variable_declarator: "v",
  },
  python: {
    function_definition: "f",
    class_definition: "c",
    expression_statement: "v",
  },
  rust: {
    function_item: "f",
    struct_item: "s",
    field_declaration: "m",
    enum_item: "g",
    enum_variant: "e",
    trait_item: "t",
    impl_item: "P",
    type_item: "t",
    const_item: "C",
    static_item: "v",
    mod_item: "n",
  },
  go: {
    function_declaration: "f",
    method_declaration: "m",
    type_spec: "t",
    type_alias: "t",
    var_spec: "v",
    const_spec: "C",
    field_declaration: "m",
  },
  java: {
    class_declaration: "c",
    method_declaration: "m",
    interface_declaration: "i",
    enum_declaration: "g",
    record_declaration: "c",
    annotation_type_declaration: "a",
    field_declaration: "f",
    constant_declaration: "C",
    enum_constant: "e",
  },
  c: {
    function_definition: "f",
    struct_specifier: "s",
    type_definition: "t",
    enum_specifier: "g",
    enumerator: "e",
    preproc_def: "d",
    preproc_function_def: "d",
    declaration: "v",
  },
  cpp: {
    function_definition: "f",
    class_specifier: "c",
    struct_specifier: "s",
    enum_specifier: "g",
    enumerator: "e",
    alias_declaration: "t",
    type_definition: "t",
    union_specifier: "u",
    namespace_definition: "n",
    field_declaration: "m",
    preproc_def: "d",
    preproc_function_def: "d",
    declaration: "v",
  },
  css: { rule_set: "r" },
  html: { element: "t" },
  json: { pair: "p" },
  toml: { pair: "v", table: "n" },
};

const scopeNodeTypes = new Set([
  "class_declaration",
  "class_definition",
  "class_specifier",
  "struct_item",
  "struct_specifier",
  "type_spec",
  "type_alias",
  "interface_declaration",
  "trait_item",
  "impl_item",
  "namespace_definition",
  "internal_module",
  "mod_item",
  "enum_item",
  "enum_specifier",
  "enum_declaration",
  "record_declaration",
  "function_declaration",
  "function_definition",
  "function_item",
  "method_declaration",
  "method_definition",
  "function_expression",
  "arrow_function",
  "function",
]);

function scopeName(node: Node): string {
  if (node.type === "impl_item") {
    const trait = node.childForFieldName("trait");
    const type = node.childForFieldName("type");
    return trait && type
      ? `${trait.text} for ${type.text}`
      : (type?.text ?? "");
  }
  const name = node.childForFieldName("name") ?? node.childForFieldName("type");
  if (name) return name.text;
  return "";
}

function goReceiver(node: Node): string {
  const receiver = node.childForFieldName("receiver");
  const declaration = receiver?.namedChildren.find(
    (child) => child?.type === "parameter_declaration",
  );
  const type = declaration?.childForFieldName("type");
  return type?.text.replace(/^[*&]+/, "") ?? "";
}

function scopeFor(node: Node, grammar: string): string[] {
  const ancestors: string[] = [];
  let parent = node.parent;
  while (parent) {
    if (scopeNodeTypes.has(parent.type)) {
      const name = scopeName(parent);
      if (name) ancestors.unshift(name);
    } else if (
      grammar === "javascript" &&
      parent.type === "object" &&
      parent.parent?.type === "variable_declarator"
    ) {
      const name = parent.parent.childForFieldName("name");
      if (name) ancestors.unshift(name.text);
    }
    parent = parent.parent;
  }
  if (grammar === "go" && node.type === "method_declaration") {
    const receiver = goReceiver(node);
    if (receiver) ancestors.push(receiver);
  }
  return ancestors;
}

function isLocalVariable(node: Node): boolean {
  let parent = node.parent;
  while (parent) {
    if (
      parent.type === "function_declaration" ||
      parent.type === "function_definition" ||
      parent.type === "function_item" ||
      parent.type === "method_declaration" ||
      parent.type === "method_definition" ||
      parent.type === "function_expression" ||
      parent.type === "arrow_function" ||
      parent.type === "function"
    )
      return true;
    parent = parent.parent;
  }
  return false;
}

function isModuleVariable(node: Node): boolean {
  let parent = node.parent;
  while (parent) {
    if (parent.type === "program") return true;
    if (parent.type === "internal_module") return true;
    if (
      parent.type === "statement_block" &&
      parent.parent?.type === "internal_module"
    ) {
      parent = parent.parent;
      continue;
    }
    if (
      parent.type === "statement_block" ||
      parent.type === "class_body" ||
      parent.type === "function_declaration" ||
      parent.type === "method_definition" ||
      parent.type === "arrow_function" ||
      parent.type === "function_expression"
    )
      return false;
    parent = parent.parent;
  }
  return false;
}

function tagKind(grammar: string, node: Node, nameNode: Node): string {
  if (
    grammar === "cpp" &&
    (node.type === "declaration" || node.type === "field_declaration") &&
    nameNode.parent?.type === "function_declarator"
  )
    return "f";
  if (grammar === "java" && node.type === "field_declaration") {
    const modifiers = node.namedChildren.find(
      (child) => child?.type === "modifiers",
    );
    return modifiers?.text.includes("final") ? "C" : "f";
  }
  if (grammar === "javascript" && node.type === "variable_declarator") {
    const value = node.childForFieldName("value");
    if (
      value?.type === "function_expression" ||
      value?.type === "arrow_function"
    )
      return "f";
  }
  if (
    (grammar === "typescript" || grammar === "tsx") &&
    node.type === "variable_declarator" &&
    node.parent?.type === "lexical_declaration"
  ) {
    return node.parent.text.startsWith("const ") ? "C" : "v";
  }
  return (
    kinds[grammar]?.[node.type] ??
    kinds[grammar]?.[nameNode.parent?.type ?? ""] ??
    kinds[grammar]?.[nameNode.parent?.parent?.type ?? ""] ??
    "s"
  );
}

export async function parseFile(
  file: string,
  source: string,
  grammar?: string,
): Promise<SymbolTag[]> {
  if (!grammar || !queries[grammar]) return [];
  const language = await getLanguage(grammar);
  let resolveQueue: () => void = () => {};
  const previous = parseQueue;
  parseQueue = new Promise<void>((resolve) => {
    resolveQueue = resolve;
  });
  await previous;
  try {
    const activeParser = await getParser();
    activeParser.setLanguage(language);
    const tree = activeParser.parse(source);
    if (!tree) return [];
    const query = new Query(language, queries[grammar]);
    try {
      const emitted = new Set<string>();
      return query.matches(tree.rootNode).flatMap((match) => {
        const nameNode = match.captures.find(
          (capture) => capture.name === "name",
        )?.node;
        const definition = match.captures.find(
          (capture) => capture.name === "definition",
        )?.node;
        if (!nameNode || !definition) return [];
        const localVariable =
          ((grammar === "typescript" ||
            grammar === "tsx" ||
            grammar === "javascript") &&
            nameNode.parent?.type === "variable_declarator" &&
            !isModuleVariable(nameNode)) ||
          (grammar === "python" &&
            definition.type === "assignment" &&
            isLocalVariable(definition));
        if (
          (grammar === "typescript" ||
            grammar === "tsx" ||
            grammar === "javascript") &&
          (definition.type === "method_definition" ||
            definition.type === "pair") &&
          isLocalVariable(definition)
        )
          return [];
        if (
          grammar === "javascript" &&
          definition.type === "field_definition" &&
          isLocalVariable(definition) &&
          !scopeFor(definition, grammar).some((name) => name.length > 0)
        )
          return [];
        const name = nameNode.text.replace(/^['"#]|['"]$/g, "");
        if (name.length > 240 || name.includes("\n")) return [];
        const semanticNode =
          grammar === "rust" &&
          definition.type === "struct_item" &&
          nameNode.parent?.type === "field_declaration"
            ? nameNode.parent
            : definition;
        const kind = tagKind(grammar, semanticNode, nameNode);
        const scope = scopeFor(semanticNode, grammar);
        const identity = `${nameNode.startIndex}:${name}:${scope.join("/")}`;
        if (emitted.has(identity)) return [];
        emitted.add(identity);
        return [
          {
            name,
            kind,
            scope,
            file: path.relative(process.cwd(), file).split(path.sep).join("/"),
            ...(localVariable ? { isLocal: true } : {}),
            line: nameNode.startPosition.row + 1,
            endLine: semanticNode.endPosition.row + 1,
            signature: semanticNode.text.split("\n", 1)[0].trim().slice(0, 240),
            isDef: true as const,
          },
        ];
      });
    } finally {
      query.delete();
      tree.delete();
    }
  } finally {
    resolveQueue();
  }
}
