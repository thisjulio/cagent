import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "bun:test";

const srcDir = decodeURIComponent(new URL("../src/", import.meta.url).pathname);

function files(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) out.push(...files(path.join(dir, entry.name)));
    else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))
      out.push(path.join(dir, entry.name));
  }
  return out;
}

function localImports(file: string): string[] {
  const src = fs.readFileSync(file, "utf8");
  return [...src.matchAll(/from\s+["'](\.[^"']+)["']/g)].map((m) => m[1]);
}

describe("dependency direction: ui → controller → domain → sdk", () => {
  it("core does not import plugins", () => {
    for (const file of files(srcDir)) {
      for (const dep of localImports(file)) {
        expect(dep.includes("plugins/")).toBe(false);
      }
    }
  });

  it("ui does not import the domain directly", () => {
    for (const file of files(path.join(srcDir, "ui"))) {
      for (const dep of localImports(file)) {
        expect(
          /\/(loop|session|registry|events|tools|loader|config|prompt)\.tsx?$/.test(
            dep,
          ),
        ).toBe(false);
      }
    }
  });

  it("controller does not import ui", () => {
    for (const file of files(path.join(srcDir, "controller"))) {
      for (const dep of localImports(file)) {
        expect(dep.includes("/ui/")).toBe(false);
      }
    }
  });

  it("domain does not import ui or controller", () => {
    const domain = [
      "loop.ts",
      "session.ts",
      "registry.ts",
      "events.ts",
      "tools.ts",
      "loader.ts",
      "config.ts",
      "prompt.ts",
    ];
    for (const name of domain) {
      for (const dep of localImports(path.join(srcDir, name))) {
        expect(/\/(ui|controller)\//.test(dep)).toBe(false);
      }
    }
  });
});
