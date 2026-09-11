import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventBus } from "../../../core/src/events";
import { loadPlugins } from "../../../core/src/loader";
import { Registry } from "../../../core/src/registry";
import { runCmd } from "../src/exec";

const PLUGIN_DIR = path.resolve(import.meta.dirname, "..");
const prevCwd = process.cwd();
let ws: string;

beforeAll(() => {
  ws = fs.mkdtempSync(path.join(os.tmpdir(), "cagent-ct-"));
  process.chdir(ws);
});

afterAll(() => {
  process.chdir(prevCwd);
});

async function freshRegistry(): Promise<{ registry: Registry; bus: EventBus }> {
  const registry = new Registry();
  const bus = new EventBus();
  await loadPlugins({ plugins: [{ name: "code-tools", path: PLUGIN_DIR }], allowlist: [] }, registry, bus);
  return { registry, bus };
}

describe("tools de code-tools", () => {
  it("write_file cria e read_file lê com offset/limit", async () => {
    const { registry } = await freshRegistry();
    await registry.tool("write_file")!.execute({ path: "a1.ts", content: "l1\nl2\nl3\nl4\n" });
    const r = await registry.tool("read_file")!.execute({ path: "a1.ts", offset: 2, limit: 2 });
    expect(r.output).toBe("2\tl2\n3\tl3");
    expect(fs.readFileSync(path.join(ws, "a1.ts"), "utf8")).toBe("l1\nl2\nl3\nl4\n");
  });

  it("edit_file: replace exato via blocks", async () => {
    const { registry } = await freshRegistry();
    await registry.tool("write_file")!.execute({ path: "a3.ts", content: "alpha\nbeta\ngamma\n" });
    await registry.tool("read_file")!.execute({ path: "a3.ts" });
    const r = await registry.tool("edit_file")!.execute({
      path: "a3.ts",
      blocks: "<<< SEARCH\nbeta\n>>>\n<<< REPLACE\nB\n>>>",
    });
    expect(r.isError).toBeFalsy();
    expect(r.output).toContain("OK a3.ts");
    expect(r.output).toContain("-beta");
    expect(r.output).toContain("+B");
    expect(fs.readFileSync(path.join(ws, "a3.ts"), "utf8")).toBe("alpha\nB\ngamma\n");
  });

  it("edit_file: anti-loop escala 1→2→3", async () => {
    const { registry } = await freshRegistry();
    await registry.tool("write_file")!.execute({ path: "a4.ts", content: "a\nb\nc\n" });
    await registry.tool("read_file")!.execute({ path: "a4.ts" });
    const edit = registry.tool("edit_file")!;
    const blocks = "<<< SEARCH\nzeta\n>>>\n<<< REPLACE\nZ\n>>>";
    const r1 = await edit.execute({ path: "a4.ts", blocks });
    expect(r1.output).toContain("ERRO E_NO_MATCH");
    const r2 = await edit.execute({ path: "a4.ts", blocks });
    expect(r2.output).toContain("ERRO E_NO_MATCH");
    expect(r2.output).toContain("use read_file");
    const r3 = await edit.execute({ path: "a4.ts", blocks });
    expect(r3.output).toContain("ERRO E_REPEATED_FAILURE");
  });

  it("edit_file: stale bloqueia edição após mudança externa", async () => {
    const { registry } = await freshRegistry();
    await registry.tool("write_file")!.execute({ path: "a5.ts", content: "x\ny\n" });
    await registry.tool("read_file")!.execute({ path: "a5.ts" });
    fs.writeFileSync(path.join(ws, "a5.ts"), "x\nCHANGED\n");
    const r = await registry.tool("edit_file")!.execute({
      path: "a5.ts",
      blocks: "<<< SEARCH\ny\n>>>\n<<< REPLACE\nY\n>>>",
    });
    expect(r.isError).toBe(true);
    expect(r.output).toContain("ERRO E_STALE");
  });

  it("read_file detecta reversão via hash", async () => {
    const { registry, bus } = await freshRegistry();
    const reverted: string[] = [];
    bus.on("code-tools/reverted", (p) => reverted.push(String((p as Record<string, unknown>).path)));
    await registry.tool("write_file")!.execute({ path: "a6.ts", content: "p\nq\n" });
    await registry.tool("read_file")!.execute({ path: "a6.ts" });
    await registry.tool("edit_file")!.execute({
      path: "a6.ts",
      blocks: "<<< SEARCH\np\n>>>\n<<< REPLACE\nP\n>>>",
    });
    fs.writeFileSync(path.join(ws, "a6.ts"), "p\nq\nzzz\n");
    await registry.tool("read_file")!.execute({ path: "a6.ts" });
    expect(reverted).toEqual([path.join(ws, "a6.ts")]);
  });

  it("edit_file: patch Codex edita via hunk", async () => {
    const { registry } = await freshRegistry();
    await registry.tool("write_file")!.execute({ path: "a7.ts", content: "a\nb\nc\n" });
    await registry.tool("read_file")!.execute({ path: "a7.ts" });
    const r = await registry.tool("edit_file")!.execute({
      patch: `*** Begin patch
a7.ts
@@ -1,3 +1,2 @@
 a
-b
 c
*** End patch`,
    });
    expect(r.isError).toBeFalsy();
    expect(fs.readFileSync(path.join(ws, "a7.ts"), "utf8")).toBe("a\nc\n");
  });

  it("edit_file: patch Add File cria o arquivo", async () => {
    const { registry } = await freshRegistry();
    const r = await registry.tool("edit_file")!.execute({
      patch: `*** Begin Patch\n*** Add File: novo.ts\n+um\n+dois\n*** End Patch`,
    });
    expect(r.isError).toBeFalsy();
    expect(fs.readFileSync(path.join(ws, "novo.ts"), "utf8")).toBe("um\ndois");
  });

  it("edit_file: Add em arquivo existente rejeita (E_EXISTS)", async () => {
    const { registry } = await freshRegistry();
    await registry.tool("write_file")!.execute({ path: "exist.ts", content: "a\n" });
    const r = await registry.tool("edit_file")!.execute({
      patch: `*** Begin Patch\n*** Add File: exist.ts\n+um\n*** End Patch`,
    });
    expect(r.isError).toBe(true);
    expect(r.output).toContain("ERRO E_EXISTS");
    expect(fs.readFileSync(path.join(ws, "exist.ts"), "utf8")).toBe("a\n");
  });

  it("edit_file: patch Delete File remove o arquivo", async () => {
    const { registry } = await freshRegistry();
    await registry.tool("write_file")!.execute({ path: "del.ts", content: "x\n" });
    const r = await registry.tool("edit_file")!.execute({
      patch: `*** Begin Patch\n*** Delete File: del.ts\n*** End patch`,
    });
    expect(r.isError).toBeFalsy();
    expect(fs.existsSync(path.join(ws, "del.ts"))).toBe(false);
  });

  it("edit_file: múltiplos blocos em uma chamada", async () => {
    const { registry } = await freshRegistry();
    await registry.tool("write_file")!.execute({ path: "a8.ts", content: "x\ny\nz\n" });
    await registry.tool("read_file")!.execute({ path: "a8.ts" });
    const r = await registry.tool("edit_file")!.execute({
      path: "a8.ts",
      blocks: "<<< SEARCH\ny\n>>>\n<<< REPLACE\nY\n>>>\n<<< SEARCH\nx\n>>>\n<<< REPLACE\nX\n>>>",
    });
    expect(r.isError).toBeFalsy();
    expect(fs.readFileSync(path.join(ws, "a8.ts"), "utf8")).toBe("X\nY\nz\n");
  });

  it("search encontra via rg", async () => {
    const { registry } = await freshRegistry();
    await registry.tool("write_file")!.execute({ path: "a9.ts", content: "const alpha = 1;\nconst beta = 2;\n" });
    const r = await registry.tool("search")!.execute({ pattern: "alpha" });
    expect(r.output).toContain("a9.ts:1:");
  });

  it("search_ast encontra via @ast-grep/cli", async () => {
    const { registry } = await freshRegistry();
    await registry.tool("write_file")!.execute({ path: "a10.ts", content: "console.log(42);\n" });
    const r = await registry.tool("search_ast")!.execute({ pattern: "console.log($X)", target: "a10.ts" });
    expect(r.isError).toBeFalsy();
    expect(r.output).toContain("a10.ts");
  });

  it("list_files lista por glob", async () => {
    const { registry } = await freshRegistry();
    const r = await registry.tool("list_files")!.execute({ pattern: "a9.ts" });
    expect(r.output).toBe("a9.ts");
  });

  it("git sombra é criada em workspace não-git", async () => {
    expect(fs.existsSync(path.join(ws, ".cagent", ".shadow", ".git"))).toBe(true);
    const log = await runCmd("git", [
      "--git-dir",
      path.join(ws, ".cagent", ".shadow", ".git"),
      "--work-tree",
      ws,
      "log",
      "--oneline",
    ]);
    expect(log.stdout.trim().split("\n").length).toBeGreaterThanOrEqual(1);
  });
});
