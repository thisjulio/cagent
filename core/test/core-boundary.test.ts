import { expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";

const forbidden = /memory-local|\.claude|CLAUDE\.md|mcp-|memory_(?:approve|ignore|edit)/;
const sourceRoot = path.join(import.meta.dir, "../src");

function files(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? files(file) : file.endsWith(".ts") || file.endsWith(".tsx") ? [file] : [];
  });
}

test("core source does not embed integration-specific concepts", () => {
  for (const file of files(sourceRoot)) {
    const source = fs.readFileSync(file, "utf8");
    expect(source.replace(/https?:\/\/[^\s]+/g, "")).not.toMatch(forbidden);
  }
});
