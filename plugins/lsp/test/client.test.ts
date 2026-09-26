import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { LspClient } from "../src/client";
import { resolveBinary } from "../src/resolve";

describe("LSP diagnostics", () => {
  let root: string | undefined;
  let client: LspClient | undefined;

  afterEach(async () => {
    await client?.close();
    if (root) fs.rmSync(root, { recursive: true, force: true });
    client = undefined;
    root = undefined;
  });

  test("receives Biome push diagnostics when pull diagnostics are unsupported", async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "cagent-lsp-"));
    const file = path.join(root, "sample.ts");
    fs.writeFileSync(
      path.join(root, "biome.json"),
      JSON.stringify({
        linter: { enabled: true, rules: { recommended: true } },
      }),
    );
    fs.writeFileSync(file, "const value: any = 1;\n");
    client = await LspClient.start(root, {
      command: [resolveBinary("biome"), "lsp-proxy"],
      extensions: [".ts"],
    });

    await client.sync(file);
    const diagnostics = (await client.call("diagnostics", file)) as Array<{
      code?: string;
      source?: string;
    }>;

    expect(diagnostics.some((item) => item.source === "biome")).toBe(true);
    expect(
      diagnostics.some((item) => item.code === "lint/suspicious/noExplicitAny"),
    ).toBe(true);
  });
});
