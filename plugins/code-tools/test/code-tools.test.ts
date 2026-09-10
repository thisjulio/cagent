import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "bun:test";
import { EventBus } from "../../../core/src/events";
import { Registry } from "../../../core/src/registry";
import { loadPlugins } from "../../../core/src/loader";

async function loaded(): Promise<Registry> {
  const registry = new Registry();
  await loadPlugins({ plugins: [{ name: "code-tools", path: "./plugins/code-tools" }], allowlist: [] }, registry, new EventBus());
  return registry;
}

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "code-tools-"));
  fs.writeFileSync(path.join(dir, ".gitignore"), "ignored.txt\n");
  fs.writeFileSync(path.join(dir, "a.txt"), "linha1\nfoo bar\nfoo\nlinha4\n");
  fs.writeFileSync(path.join(dir, "ignored.txt"), "foo\n");
  return dir;
}

test("search_files casa regex e respeita .gitignore", async () => {
  const registry = await loaded();
  const dir = tempDir();
  const prev = process.cwd();
  process.chdir(dir);
  try {
    const res = (await registry.tool("search_files")!.execute({ pattern: "**/*.txt", regex: "foo" })) as { output: string };
    expect(res.output).toContain("a.txt:2: foo bar");
    expect(res.output).toContain("a.txt:3: foo");
    expect(res.output).not.toContain("ignored.txt");
  } finally {
    process.chdir(prev);
  }
});

test("edit_file substitui faixa de linhas", async () => {
  const registry = await loaded();
  const dir = tempDir();
  const file = path.join(dir, "a.txt");
  const res = (await registry.tool("edit_file")!.execute({
    path: file,
    start_line: 2,
    end_line: 3,
    content: "nova1\nnova2",
  })) as { output: string };
  expect(res.output).toContain("editado");
  expect(fs.readFileSync(file, "utf8")).toBe("linha1\nnova1\nnova2\nlinha4\n");
});

test("edit_file rejeita linha fora do arquivo", async () => {
  const registry = await loaded();
  const dir = tempDir();
  const res = (await registry.tool("edit_file")!.execute({
    path: path.join(dir, "a.txt"),
    start_line: 99,
    content: "x",
  })) as { output: string; isError?: boolean };
  expect(res.isError).toBe(true);
});

test("scaffold cria boilerplate da linguagem", async () => {
  const registry = await loaded();
  const dir = tempDir();
  const file = path.join(dir, "src", "meu_algo.ts");
  const res = (await registry.tool("scaffold")!.execute({ language: "ts", path: file })) as { output: string };
  expect(res.output).toContain("criado");
  expect(fs.readFileSync(file, "utf8")).toContain("export function meuAlgo()");
});

test("scaffold rejeita linguagem desconhecida", async () => {
  const registry = await loaded();
  const res = (await registry.tool("scaffold")!.execute({ language: "cobol", path: "x.cob" })) as {
    output: string;
    isError?: boolean;
  };
  expect(res.isError).toBe(true);
});
