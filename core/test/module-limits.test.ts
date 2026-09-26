import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { collectSourceFiles, LIMIT } from "../../scripts/check-module-limits";

function countLines(contents: string): number {
  if (contents.length === 0) return 0;
  return (
    contents.split(/\r\n|\n|\r/).length -
    (contents.endsWith("\n") || contents.endsWith("\r") ? 1 : 0)
  );
}

async function findViolations(directory: string): Promise<string[]> {
  const violations: string[] = [];
  for (const file of await collectSourceFiles(directory)) {
    const lines = countLines(await Bun.file(file).text());
    if (lines > LIMIT) violations.push(path.relative(directory, file));
  }
  return violations.sort();
}

describe("module line limit", () => {
  test("accepts 500 lines and rejects 501 lines", async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "cagent-line-limit-"),
    );
    try {
      await writeFile(
        path.join(directory, "at-limit.ts"),
        `${"line\n".repeat(499)}line`,
      );
      await writeFile(
        path.join(directory, "over-limit.ts"),
        `${"line\n".repeat(500)}line`,
      );
      expect(await findViolations(directory)).toEqual(["over-limit.ts"]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("ignores tests and generated directories", async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "cagent-line-limit-"),
    );
    try {
      for (const name of ["test", "generated", "dist"]) {
        const nested = path.join(directory, name);
        await mkdir(nested);
        await writeFile(path.join(nested, "large.ts"), "line\n".repeat(501));
      }
      await writeFile(path.join(directory, "notes.md"), "line\n".repeat(501));
      expect(await findViolations(directory)).toEqual([]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
