import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "bun:test";

const srcDir = decodeURIComponent(new URL("../src/", import.meta.url).pathname);

type SourceFile = { file: string; source: string };

function sourceFiles(dir: string): SourceFile[] {
  const result: SourceFile[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...sourceFiles(file));
    else if (/\.(ts|tsx)$/.test(entry.name))
      result.push({ file, source: fs.readFileSync(file, "utf8") });
  }
  return result;
}

function imports(source: string): string[] {
  return [...source.matchAll(/(?:from\s+|import\s*\()(["'])([^"']+)\1/g)].map(
    (match) => match[2],
  );
}

function relativeImports(source: string): string[] {
  return imports(source).filter((dependency) => dependency.startsWith("."));
}

function under(file: string, directory: string): boolean {
  return file.startsWith(path.join(srcDir, directory) + path.sep);
}

describe("dependency direction: ui → controller → domain → sdk", () => {
  const sources = sourceFiles(srcDir);

  it("core does not import plugins", () => {
    for (const source of sources) {
      expect(
        imports(source.source).some((dependency) =>
          dependency.includes("plugins/"),
        ),
      ).toBe(false);
    }
  });

  it("UI does not import domain implementation modules", () => {
    for (const source of sources.filter((entry) => under(entry.file, "ui"))) {
      for (const dependency of relativeImports(source.source)) {
        expect(
          /\/(loop|session|registry|events|tools|loader|config|prompt)(\/|\.tsx?$)/.test(
            dependency,
          ),
        ).toBe(false);
      }
    }
  });

  it("controller and domain modules do not import UI", () => {
    for (const source of sources.filter(
      (entry) => under(entry.file, "controller") || isDomain(entry.file),
    )) {
      expect(
        imports(source.source).some(
          (dependency) =>
            dependency === "react" ||
            dependency.includes("@opentui/") ||
            dependency.includes("/ui/"),
        ),
      ).toBe(false);
    }
  });

  it("domain modules do not import controller", () => {
    for (const source of sources.filter((entry) => isDomain(entry.file))) {
      expect(
        relativeImports(source.source).some((dependency) =>
          dependency.includes("/controller/"),
        ),
      ).toBe(false);
    }
  });
});

function isDomain(file: string): boolean {
  return (
    [
      "loop.ts",
      "registry.ts",
      "events.ts",
      "tools.ts",
      "loader.ts",
      "config.ts",
      "prompt.ts",
    ].includes(path.basename(file)) || under(file, "session")
  );
}
