import { afterEach, expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ContextExtension, PluginContext } from "@cagent/sdk";
import register from "../src/index";
import { buildIndex } from "../src/indexer";
import { rank, render } from "../src/map";
import { extract } from "../src/symbols";

const temporary: string[] = [];
afterEach(async () => {
  for (const dir of temporary.splice(0))
    await fs.rm(dir, { recursive: true, force: true });
});
async function repository() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "repo-map-"));
  temporary.push(root);
  return root;
}

test("extracts declarations, calls, types and imports without function bodies", () => {
  const symbols = extract(
    "example.ts",
    'import { run } from "./service";\nexport function start(input: Config): void { run(input); }\nconst stop = (x: number) => { return x; };\ninterface Config { enabled: boolean }',
  );
  expect(symbols.imports).toEqual(["./service"]);
  expect(symbols.references).toContain("run");
  expect(symbols.references).toContain("Config");
  expect(symbols.definitions.map((def) => def.name)).toEqual([
    "start",
    "stop",
    "Config",
  ]);
  expect(symbols.definitions[0].signature).toBe(
    "function start(input: Config): void",
  );
  expect(symbols.definitions[0].line).toBe(2);
  expect(symbols.definitions[1].signature).not.toContain("return");
});

test("ranks referenced hubs first and renders complete entries within budget", () => {
  const files = [
    extract("a.ts", 'import { hub } from "./hub"; hub();'),
    extract("b.ts", 'import { hub } from "./hub"; hub();'),
    extract("hub.ts", "export function hub(): void {}"),
    extract("lonely.ts", "function lonely() {}"),
  ];
  const ranked = rank(files);
  expect(ranked[0].file).toBe("hub.ts");
  const output = render(ranked, 100);
  expect(output).toContain("function hub(): void");
  expect(output.length).toBeLessThanOrEqual(400);
  expect(render(ranked, 0)).toBe("");
  expect(rank([])).toEqual([]);
});

test("cache works without Git and excludes dependencies, builds, hidden and escaping paths", async () => {
  const root = await repository();
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), "repo-map-outside-"));
  temporary.push(outside);
  await fs.writeFile(path.join(outside, "secret.ts"), "function secret() {}");
  for (const directory of ["node_modules", "dist", ".hidden", "cache"]) {
    await fs.mkdir(path.join(root, directory));
    await fs.writeFile(
      path.join(root, directory, "ignored.ts"),
      "function ignored() {}",
    );
  }
  await fs.symlink(
    path.join(outside, "secret.ts"),
    path.join(root, "escape.ts"),
  );
  await fs.writeFile(path.join(root, "main.ts"), "function first() {}");
  const options = {
    root,
    cacheDirectory: path.join(root, "cache"),
    warn: () => {},
  };
  expect((await buildIndex(options)).map((file) => file.file)).toEqual([
    "main.ts",
  ]);
  expect((await buildIndex(options))[0].definitions[0].name).toBe("first");
  await fs.writeFile(path.join(root, "main.ts"), "function replacement() {}");
  expect((await buildIndex(options))[0].definitions[0].name).toBe(
    "replacement",
  );
  await fs.unlink(path.join(root, "main.ts"));
  expect(await buildIndex(options)).toEqual([]);
});

test("registration prepares the map and contributes bounded untrusted stable context", async () => {
  const root = await repository();
  await fs.writeFile(path.join(root, "main.ts"), "export function main() {}");
  const extensions: ContextExtension[] = [];
  const warnings: unknown[] = [];
  const ctx = {
    config: { root },
    storage: { path: () => path.join(root, ".repo-map", "index") },
    diagnostics: { report: (value: unknown) => warnings.push(value) },
    registerContextExtension: (value: ContextExtension) =>
      extensions.push(value),
  } as unknown as PluginContext;
  await register(ctx);
  expect(warnings).toEqual([]);
  expect(extensions[0].phase).toBe("stable");
  const contribution = await extensions[0].contribute({
    query: "",
    tokenBudget: 100,
  });
  expect(contribution?.content).toContain("main()");
  expect(contribution?.untrusted).toBe(true);
  expect(contribution?.estimatedTokens).toBeLessThanOrEqual(100);
  expect(
    await extensions[0].contribute({ query: "", tokenBudget: 0 }),
  ).toBeUndefined();
  expect(
    await extensions[0].contribute({ query: "", signal: AbortSignal.abort() }),
  ).toBeUndefined();
});
