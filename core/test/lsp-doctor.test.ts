import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { detectLspServers } from "../src/lsp/doctor";

describe("LSP doctor", () => {
  test("classifies active project servers and unconfigured languages", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cagent-lsp-"));
    const bin = path.join(root, "bin");
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(root, "tsconfig.json"), "{}");
    const server = path.join(bin, "typescript-language-server");
    fs.writeFileSync(
      server,
      "#!/bin/sh\necho typescript-language-server 1.2.3\n",
    );
    fs.chmodSync(server, 0o755);

    const results = await detectLspServers(root, bin);
    expect(results.find((item) => item.language === "ts")).toMatchObject({
      status: "ok",
      version: "1.2.3",
    });
    expect(results.find((item) => item.language === "py")?.status).toBe(
      "unconfigured",
    );
  });

  test("reports a missing server when it is absent from PATH", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cagent-lsp-"));
    fs.writeFileSync(path.join(root, "sample.ts"), "");
    const results = await detectLspServers(root, "");
    expect(results.find((item) => item.language === "ts")?.status).toBe(
      "missing",
    );
  });
});
