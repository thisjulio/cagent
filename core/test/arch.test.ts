import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "bun:test";

const srcDir = decodeURIComponent(new URL("../src/", import.meta.url).pathname);

function files(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) out.push(...files(path.join(dir, entry.name)));
    else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) out.push(path.join(dir, entry.name));
  }
  return out;
}

function localImports(file: string): string[] {
  const src = fs.readFileSync(file, "utf8");
  return [...src.matchAll(/from\s+["'](\.[^"']+)["']/g)].map((m) => m[1]);
}

describe("direção de dependências: ui → controller → domínio → sdk", () => {
  it("core não importa plugins", () => {
    for (const file of files(srcDir)) {
      for (const dep of localImports(file)) {
        expect(dep.includes("plugins/")).toBe(false);
      }
    }
  });

  it("ui não importa o domínio diretamente", () => {
    for (const file of files(path.join(srcDir, "ui"))) {
      for (const dep of localImports(file)) {
        expect(/\/(loop|session|registry|events|tools|loader|config|prompt)\.tsx?$/.test(dep)).toBe(false);
      }
    }
  });

  it("controller não importa ui", () => {
    for (const file of files(path.join(srcDir, "controller"))) {
      for (const dep of localImports(file)) {
        expect(dep.includes("/ui/")).toBe(false);
      }
    }
  });

  it("domínio não importa ui nem controller", () => {
    const domain = ["loop.ts", "session.ts", "registry.ts", "events.ts", "tools.ts", "loader.ts", "config.ts", "prompt.ts"];
    for (const name of domain) {
      for (const dep of localImports(path.join(srcDir, name))) {
        expect(/\/(ui|controller)\//.test(dep)).toBe(false);
      }
    }
  });
});
