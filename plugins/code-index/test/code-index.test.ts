import { afterEach, beforeEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { PluginContext, ToolDefinition } from "@cagent/sdk";
import { createCodeIndex } from "../src/store";
import { codeIndexTools } from "../src/tools";
import { parseFile } from "../src/tags";

let workspace: string;
let originalCwd: string;
let storageDir: string;

function context(config: Record<string, unknown> = {}): PluginContext {
  return {
    name: "code-index",
    config,
    observability: {
      recordEvent() {},
      async withSpan(
        _name: string,
        _attributes: unknown,
        callback: () => unknown,
      ) {
        return await callback();
      },
    } as never,
    storage: {
      namespace: "code-index",
      path: (...segments: string[]) => path.join(storageDir, ...segments),
    },
    diagnostics: { report() {} },
    registerTool() {},
    registerHook() {},
    registerProvider() {},
    registerSubagent() {},
    emit() {},
    on() {},
    promptSection() {},
    registerContextExtension() {},
    registerCommandSource() {},
    registerSkillSource() {},
    registerCommand() {},
    async contributeContext() {
      return [];
    },
    activity() {},
    registerCleanup() {},
  } as unknown as PluginContext;
}

async function write(relative: string, content: string): Promise<void> {
  const file = path.join(workspace, relative);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content);
}

function tool(tools: ToolDefinition[], name: string): ToolDefinition {
  return tools.find((item) => item.name === name)!;
}

beforeEach(async () => {
  originalCwd = process.cwd();
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), "code-index-test-"));
  storageDir = await fs.mkdtemp(path.join(os.tmpdir(), "code-index-store-"));
  process.chdir(workspace);
});

test("emits stable kinds and enclosing Rust scopes", async () => {
  const tags = await parseFile(
    "nested.rs",
    "struct Buffer { data: Vec<u8> }\nimpl Buffer {\n  fn new() {}\n}\n",
    "rust",
  );
  expect(tags.find((tag) => tag.name === "Buffer")?.kind).toBe("s");
  expect(tags.find((tag) => tag.name === "data")).toMatchObject({
    kind: "m",
    scope: ["Buffer"],
  });
  expect(tags.find((tag) => tag.name === "new")).toMatchObject({
    kind: "f",
    scope: ["Buffer"],
  });
  expect(tags.find((tag) => tag.kind === "P")).toMatchObject({
    name: "Buffer",
    scope: [],
  });
});

test("marks TypeScript and JavaScript function-local variables", async () => {
  const source = [
    "const CONFIG = 1;",
    "function greet() {",
    "  const local = 2;",
    "  function inner() {",
    "    const nested = 3;",
    "  }",
    "}",
  ].join("\n");
  for (const grammar of ["typescript", "javascript"]) {
    const tags = await parseFile("locals", source, grammar);
    expect(tags.map((tag) => tag.name)).toContain("CONFIG");
    expect(tags.find((tag) => tag.name === "local")).toMatchObject({
      isLocal: true,
      scope: ["greet"],
    });
    expect(tags.find((tag) => tag.name === "nested")).toMatchObject({
      isLocal: true,
      scope: ["greet", "inner"],
    });
  }
});

test("retains module declarations and marks JS and TS block-local symbols", async () => {
  const source = [
    "const CONFIG = 1;",
    "let mutable = 2;",
    "if (true) { const blockLocal = 3; }",
    "function outer() {",
    "  const callback = () => {};",
    "  const routes = { nested() {} };",
    "  function inner() {}",
    "}",
  ].join("\n");
  for (const grammar of ["typescript", "javascript", "tsx"]) {
    const tags = await parseFile("blocks", source, grammar);
    expect(tags.find((tag) => tag.name === "CONFIG")?.scope).toEqual([]);
    expect(tags.find((tag) => tag.name === "mutable")?.scope).toEqual([]);
    expect(tags.find((tag) => tag.name === "inner")?.scope).toEqual(["outer"]);
    for (const name of ["blockLocal", "callback", "routes"]) {
      expect(tags.find((tag) => tag.name === name)?.isLocal).toBe(true);
    }
    expect(tags.some((tag) => tag.name === "nested")).toBe(false);
  }
});

test("captures scoped declarations in TS, JS, Go, Java and C++", async () => {
  const samples: Array<[string, string, string, string, string[]]> = [
    [
      "typescript",
      "namespace N { class Box { run() {} } }",
      "run",
      "m",
      ["N", "Box"],
    ],
    ["typescript", "namespace N { const A = 1; }", "A", "C", ["N"]],
    ["javascript", "const routes = { get() {} };", "get", "m", ["routes"]],
    [
      "go",
      "type Box struct { Value int }\nfunc (b *Box) Run() {}",
      "Run",
      "m",
      ["Box"],
    ],
    ["java", "class Widget { int field; }", "field", "f", ["Widget"]],
    [
      "java",
      "class Widget { static final int MAX = 1; }",
      "MAX",
      "C",
      ["Widget"],
    ],
    [
      "cpp",
      "namespace N { class Box { void run() {} }; }",
      "run",
      "f",
      ["N", "Box"],
    ],
  ];
  for (const [grammar, source, name, kind, scope] of samples) {
    const tag = (await parseFile("scope", source, grammar)).find(
      (item) => item.name === name,
    );
    expect(tag).toMatchObject({ name, kind, scope });
  }
});

afterEach(async () => {
  process.chdir(originalCwd);
  await fs.rm(workspace, { recursive: true, force: true });
  await fs.rm(storageDir, { recursive: true, force: true });
});

test("parses TypeScript definitions and keeps workspace-relative paths", async () => {
  const tags = await parseFile(
    "src/sample.ts",
    "export function greet(name: string) {\n  return name;\n}\n",
    "typescript",
  );
  expect(tags).toHaveLength(1);
  expect(tags[0]).toMatchObject({
    name: "greet",
    kind: "f",
    scope: [],
    file: "src/sample.ts",
    line: 1,
    endLine: 3,
    isDef: true,
  });
});

test("extracts common declaration forms across all advertised grammars", async () => {
  const samples: Array<[string, string, string[]]> = [
    [
      "typescript",
      "const answer = 42;\nfunction run() {}\n",
      ["answer", "run"],
    ],
    ["tsx", "const View = () => <div />;\n", ["View"]],
    [
      "javascript",
      "const answer = 42;\nclass Widget {}\n",
      ["answer", "Widget"],
    ],
    [
      "python",
      "def run():\n return 42\nclass Widget:\n pass\n",
      ["run", "Widget"],
    ],
    ["rust", "fn run() {}\nstruct Widget;\n", ["run", "Widget"]],
    [
      "go",
      "func run() {}\ntype Widget struct {}\ntype Alias = string\n",
      ["run", "Widget", "Alias"],
    ],
    ["java", "class Widget { void run() {} }\n", ["Widget", "run"]],
    ["c", "int run() { return 42; }\ntypedef int Alias;\n", ["run", "Alias"]],
    ["cpp", "class Widget { void run(){} };\n", ["Widget", "run"]],
    ["css", ".widget { color: red; }\n", [".widget"]],
    ["html", "<section></section>\n", ["section"]],
    ["json", '{"answer": 42}\n', ["answer"]],
    ["toml", "[section]\nanswer = 42\n", ["section", "answer"]],
  ];
  for (const [grammar, source, expected] of samples) {
    const tags = await parseFile("fixture", source, grammar);
    expect(tags.map((tag) => tag.name)).toEqual(
      expect.arrayContaining(expected),
    );
  }
});

test("covers declared alias, field, and namespace forms", async () => {
  const samples: Array<[string, string, string[]]> = [
    [
      "typescript",
      "class Box { field = 1; }\nnamespace N { export function nested() {} }\n",
      ["Box", "field", "N"],
    ],
    ["python", "class Box:\n def method(self): pass\n", ["Box", "method"]],
    ["rust", "type Alias = u8;\nconst VALUE: u8 = 1;\n", ["Alias", "VALUE"]],
    ["go", "type Alias = string\n", ["Alias"]],
    [
      "java",
      "record Point(int x) {}\nenum Color { RED }\n",
      ["Point", "Color"],
    ],
    ["c", "typedef int Alias;\n", ["Alias"]],
    ["cpp", "class Box { void run() {} };\n", ["Box", "run"]],
    ["toml", "[section]\nkey = 1\n", ["section", "key"]],
  ];
  for (const [grammar, source, expected] of samples) {
    const tags = await parseFile("fixture", source, grammar);
    expect(tags.map((tag) => tag.name)).toEqual(
      expect.arrayContaining(expected),
    );
  }
});

test("indexes JavaScript assigned functions and object methods", async () => {
  const tags = await parseFile(
    "express-sample.js",
    [
      "const callback = function callback() {};",
      "const handler = () => {};",
      "const routes = {",
      "  getStatus() {},",
      "  middleware: function middleware() {},",
      "};",
      "module.exports.handle = function handle() {};",
    ].join("\n"),
    "javascript",
  );
  expect(tags.map((tag) => tag.name)).toEqual(
    expect.arrayContaining([
      "callback",
      "handler",
      "routes",
      "getStatus",
      "middleware",
      "handle",
    ]),
  );
  expect(tags.filter((tag) => tag.name === "getStatus")).toHaveLength(1);
});

test("indexes Rust impl blocks, associated functions, fields, and modules", async () => {
  const tags = await parseFile(
    "bytes-sample.rs",
    [
      "pub struct Buffer { data: Vec<u8> }",
      "impl Buffer {",
      "  pub fn new() -> Self { Self { data: Vec::new() } }",
      "}",
      "pub mod storage {}",
      "pub static GLOBAL: usize = 0;",
    ].join("\n"),
    "rust",
  );
  expect(tags.map((tag) => tag.name)).toEqual(
    expect.arrayContaining(["Buffer", "data", "new", "storage", "GLOBAL"]),
  );
});

test("indexes C and C++ preprocessor macros", async () => {
  const samples: Array<[string, string]> = [
    ["c", "#define C_VALUE 1\n#define C_CALL(x) (x)\n"],
    ["cpp", "#define CPP_VALUE 1\n#define CPP_CALL(x) (x)\n"],
  ];
  for (const [grammar, source] of samples) {
    const tags = await parseFile("macros", source, grammar);
    expect(tags.map((tag) => tag.name)).toEqual(
      expect.arrayContaining([
        grammar === "c" ? "C_VALUE" : "CPP_VALUE",
        grammar === "c" ? "C_CALL" : "CPP_CALL",
      ]),
    );
  }
});

test("repo map is reusable, bounded, and reflects invalidation and deletions", async () => {
  await write("src/a.ts", "export function alpha() { return 1; }\n");
  await write("src/b.ts", "export function beta() { return 2; }\n");
  const index = createCodeIndex(context({ repo_map_tokens: 100 }));
  const first = await index.repoMap();
  const second = await index.repoMap();
  expect(first).toContain("alpha");
  expect(second).toEqual(first);
  expect(first.length).toBeLessThanOrEqual(400);

  await write("src/a.ts", "export function gamma() { return 3; }\n");
  await index.invalidate("src/a.ts");
  const updated = await index.repoMap();
  expect(updated).toContain("gamma");
  expect(updated).not.toContain("alpha");

  await fs.rm("src/b.ts");
  await index.invalidate("src/b.ts");
  expect(await index.repoMap()).not.toContain("beta");
});

test("repo map excludes locals while outline labels them", async () => {
  await write(
    "src/box.ts",
    "namespace N {\n  export class Box { run() { const noise = 1; } }\n}\n",
  );
  const index = createCodeIndex(context());
  const map = await index.repoMap();
  expect(map).toContain("N.Box.run [m]");
  expect(map).not.toContain(".noise [");
  const outline = await tool(codeIndexTools(index), "outline").execute({
    path: "src/box.ts",
  });
  expect(outline.output).toContain("N.Box.run\tm");
  expect(outline.output).toContain("N.Box.run.noise\tC (local)");
});

test("invalid repository map budgets fall back safely and zero returns no content", async () => {
  await write("sample.ts", "export function greet() { return 1; }\n");
  const index = createCodeIndex(context({ repo_map_tokens: "not-a-number" }));
  expect(index.tokenBudget).toBe(1500);
  expect(await index.repoMap(0)).toBe("");
});

test("cache entries remain tied to their relative path", async () => {
  const source = "export function same() { return 1; }\n";
  await write("one.ts", source);
  await write("two.ts", source);
  const index = createCodeIndex(context());
  expect((await index.tags("one.ts"))[0]?.file).toBe("one.ts");
  expect((await index.tags("two.ts"))[0]?.file).toBe("two.ts");

  const reloaded = createCodeIndex(context());
  expect((await reloaded.tags("two.ts"))[0]?.file).toBe("two.ts");
});

test("ignores pre-scope disk cache entries with the old key format", async () => {
  const source = "class Widget { run() {} }\n";
  await write("widget.ts", source);
  const hash = createHash("sha256").update(source).digest("hex");
  const legacyKey = createHash("sha256")
    .update(`widget.ts\0${hash}`)
    .digest("hex");
  await fs.writeFile(
    path.join(storageDir, `${legacyKey}.json`),
    JSON.stringify([
      { name: "run", kind: "method_definition", file: "widget.ts" },
    ]),
  );
  const tags = await createCodeIndex(context()).tags("widget.ts");
  expect(tags.find((tag) => tag.name === "run")).toMatchObject({
    kind: "m",
    scope: ["Widget"],
  });
});

test("outline and read_symbol accept workspace paths and reject escaping symlinks", async () => {
  await write("src/sample.ts", "export function greet() {\n  return 42;\n}\n");
  const outside = path.join(os.tmpdir(), `code-index-outside-${Date.now()}.ts`);
  await fs.writeFile(outside, "export function secret() {}\n");
  await fs.symlink(outside, path.join(workspace, "escape.ts"));
  const tools = codeIndexTools(createCodeIndex(context()));

  const outline = await tool(tools, "outline").execute({
    path: "src/sample.ts",
  });
  expect(outline.output).toContain("greet");
  expect(outline.evidence?.[0]?.path).toBe("src/sample.ts");

  const symbol = await tool(tools, "read_symbol").execute({
    path: "src/sample.ts",
    name: "greet",
  });
  expect(symbol.output).toContain("return 42");
  expect(symbol.evidence?.[0]?.path).toBe("src/sample.ts");

  const escaped = await tool(tools, "outline").execute({ path: "escape.ts" });
  expect(escaped.isError).toBe(true);
  expect(escaped.output).toContain("outside the workspace");
  await fs.rm(outside, { force: true });
});

test("read_symbol reports duplicate declarations instead of choosing arbitrarily", async () => {
  await write(
    "duplicate.ts",
    "export function same() { return 1; }\nexport function same() { return 2; }\n",
  );
  const result = await tool(
    codeIndexTools(createCodeIndex(context())),
    "read_symbol",
  ).execute({ path: "duplicate.ts", name: "same" });
  expect(result.isError).toBe(true);
  expect(result.output).toContain("Ambiguous symbol");
});

test("find_refs paginates exact textual matches with relative paths", async () => {
  await write(
    "src/refs.ts",
    "const target = 1;\ntarget++;\nconst targetCopy = target;\n",
  );
  const refs = tool(codeIndexTools(createCodeIndex(context())), "find_refs");
  const first = await refs.execute({ name: "target", limit: 2 });
  expect(first.output).toContain("src/refs.ts:1");
  expect(first.output).toContain("offset=2");
  const second = await refs.execute({ name: "target", limit: 2, offset: 2 });
  expect(second.output).toContain("src/refs.ts:3");
  expect(second.output).toContain("= target;");
});

test("unsupported Markdown and YAML files are not advertised as indexable", async () => {
  await write("README.md", "# Heading\n");
  await write("config.yml", "answer: 42\n");
  await write("src/format.cxx", "int format_value() { return 1; }\n");
  await write("include/format.hxx", "int format_header();\n");
  const index = createCodeIndex(context());
  expect(await index.tags("README.md")).toEqual([]);
  expect(await index.tags("config.yml")).toEqual([]);
  expect((await index.tags("src/format.cxx"))[0]?.name).toBe("format_value");
  expect((await index.tags("include/format.hxx"))[0]?.name).toBe(
    "format_header",
  );
});
