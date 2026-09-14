import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { PluginContext, ToolDefinition } from "@cagent/sdk";
import register from "../src/index";
import { runCmd } from "../src/exec";

const prevCwd = process.cwd();
let ws: string;

beforeAll(() => {
  ws = fs.mkdtempSync(path.join(os.tmpdir(), "cagent-ct-"));
  process.chdir(ws);
});

afterAll(() => {
  process.chdir(prevCwd);
});

function freshTools(): { tools: Map<string, ToolDefinition>; events: string[] } {
  const tools = new Map<string, ToolDefinition>();
  const events: string[] = [];
  const context = {
    config: {},
    registerTool: (tool: ToolDefinition) => tools.set(tool.name, tool),
    emit: (event: string) => events.push(event),
    promptSection: () => {},
  } as unknown as PluginContext;
  register(context);
  return { tools, events };
}

describe("code-tools tools", () => {
  it("write_file creates and read_file reads with offset/limit", async () => {
    const { tools } = freshTools();
    await tools.get("write_file")!.execute({ path: "a1.ts", content: "l1\nl2\nl3\nl4\n" });
    const r = await tools.get("read_file")!.execute({ path: "a1.ts", offset: 2, limit: 2 });
    expect(r.output).toBe("2\tl2\n3\tl3");
    expect(fs.readFileSync(path.join(ws, "a1.ts"), "utf8")).toBe("l1\nl2\nl3\nl4\n");
  });

  it("edit_file: replace exato via blocks", async () => {
    const { tools } = freshTools();
    await tools.get("write_file")!.execute({ path: "a3.ts", content: "alpha\nbeta\ngamma\n" });
    await tools.get("read_file")!.execute({ path: "a3.ts" });
    const r = await tools.get("edit_file")!.execute({
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
    const { tools } = freshTools();
    await tools.get("write_file")!.execute({ path: "a4.ts", content: "a\nb\nc\n" });
    await tools.get("read_file")!.execute({ path: "a4.ts" });
    const edit = tools.get("edit_file")!;
    const blocks = "<<< SEARCH\nzeta\n>>>\n<<< REPLACE\nZ\n>>>";
    const r1 = await edit.execute({ path: "a4.ts", blocks });
    expect(r1.output).toContain("ERROR E_NO_MATCH");
    const r2 = await edit.execute({ path: "a4.ts", blocks });
    expect(r2.output).toContain("ERROR E_NO_MATCH");
    expect(r2.output).toContain("use read_file");
    const r3 = await edit.execute({ path: "a4.ts", blocks });
    expect(r3.output).toContain("ERROR E_REPEATED_FAILURE");
  });

  it("edit_file: stale blocks editing after an external change", async () => {
    const { tools } = freshTools();
    await tools.get("write_file")!.execute({ path: "a5.ts", content: "x\ny\n" });
    await tools.get("read_file")!.execute({ path: "a5.ts" });
    fs.writeFileSync(path.join(ws, "a5.ts"), "x\nCHANGED\n");
    const r = await tools.get("edit_file")!.execute({
      path: "a5.ts",
      blocks: "<<< SEARCH\ny\n>>>\n<<< REPLACE\nY\n>>>",
    });
    expect(r.isError).toBe(true);
    expect(r.output).toContain("ERROR E_STALE");
  });

  it("read_file detects a revert through the hash", async () => {
    const { tools, events } = freshTools();
    const reverted: string[] = [];
    await tools.get("write_file")!.execute({ path: "a6.ts", content: "p\nq\n" });
    await tools.get("read_file")!.execute({ path: "a6.ts" });
    await tools.get("edit_file")!.execute({
      path: "a6.ts",
      blocks: "<<< SEARCH\np\n>>>\n<<< REPLACE\nP\n>>>",
    });
    fs.writeFileSync(path.join(ws, "a6.ts"), "p\nq\nzzz\n");
    await tools.get("read_file")!.execute({ path: "a6.ts" });
    if (events.includes("code-tools/reverted")) reverted.push(path.join(ws, "a6.ts"));
    expect(reverted).toEqual([path.join(ws, "a6.ts")]);
  });

  it("edit_file: patch Codex edita via hunk", async () => {
    const { tools } = freshTools();
    await tools.get("write_file")!.execute({ path: "a7.ts", content: "a\nb\nc\n" });
    await tools.get("read_file")!.execute({ path: "a7.ts" });
    const r = await tools.get("edit_file")!.execute({
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

  it("edit_file: Add File patch creates the file", async () => {
    const { tools } = freshTools();
    const r = await tools.get("edit_file")!.execute({
      patch: `*** Begin Patch\n*** Add File: new.ts\n+one\n+two\n*** End Patch`,
    });
    expect(r.isError).toBeFalsy();
    expect(fs.readFileSync(path.join(ws, "new.ts"), "utf8")).toBe("one\ntwo");
  });

  it("edit_file: Add rejects an existing file (E_EXISTS)", async () => {
    const { tools } = freshTools();
    await tools.get("write_file")!.execute({ path: "exist.ts", content: "a\n" });
    const r = await tools.get("edit_file")!.execute({
      patch: `*** Begin Patch\n*** Add File: exist.ts\n+one\n*** End Patch`,
    });
    expect(r.isError).toBe(true);
    expect(r.output).toContain("ERROR E_EXISTS");
    expect(fs.readFileSync(path.join(ws, "exist.ts"), "utf8")).toBe("a\n");
  });

  it("edit_file: Delete File patch removes the file", async () => {
    const { tools } = freshTools();
    await tools.get("write_file")!.execute({ path: "del.ts", content: "x\n" });
    const r = await tools.get("edit_file")!.execute({
      patch: `*** Begin Patch\n*** Delete File: del.ts\n*** End patch`,
    });
    expect(r.isError).toBeFalsy();
    expect(fs.existsSync(path.join(ws, "del.ts"))).toBe(false);
  });

  it("edit_file: multiple blocks in one call", async () => {
    const { tools } = freshTools();
    await tools.get("write_file")!.execute({ path: "a8.ts", content: "x\ny\nz\n" });
    await tools.get("read_file")!.execute({ path: "a8.ts" });
    const r = await tools.get("edit_file")!.execute({
      path: "a8.ts",
      blocks: "<<< SEARCH\ny\n>>>\n<<< REPLACE\nY\n>>>\n<<< SEARCH\nx\n>>>\n<<< REPLACE\nX\n>>>",
    });
    expect(r.isError).toBeFalsy();
    expect(fs.readFileSync(path.join(ws, "a8.ts"), "utf8")).toBe("X\nY\nz\n");
  });

  it("search encontra via rg", async () => {
    const { tools } = freshTools();
    await tools.get("write_file")!.execute({ path: "a9.ts", content: "const alpha = 1;\nconst beta = 2;\n" });
    const r = await tools.get("search")!.execute({ pattern: "alpha" });
    expect(r.output).toContain("a9.ts:1:");
  });

  it("search_ast encontra via @ast-grep/napi", async () => {
    const { tools } = freshTools();
    await tools.get("write_file")!.execute({ path: "a10.ts", content: "console.log(42);\n" });
    const r = await tools.get("search_ast")!.execute({ pattern: "console.log($X)", target: "a10.ts" });
    expect(r.isError).toBeFalsy();
    expect(r.output).toContain("a10.ts");
  });

  it("list_files lists by glob", async () => {
    const { tools } = freshTools();
    const r = await tools.get("list_files")!.execute({ pattern: "a9.ts" });
    expect(r.output).toBe("a9.ts");
  });

  it("shadow Git is created in a non-Git workspace", async () => {
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
