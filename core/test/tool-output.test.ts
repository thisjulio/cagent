import { expect, test } from "bun:test";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prepareToolOutput, toolOutputLimit } from "../src/tool-output";

test("short output stays unchanged without creating files", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "cagent-output-"));
  try {
    expect(await prepareToolOutput("short", 4000, directory)).toBe("short");
    expect(await readdir(directory)).toEqual([]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("long output preserves head and failure tail and saves every line", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "cagent-output-"));
  const output = `Build started\n${"progress\n".repeat(1000)}ERROR: build failed`;
  try {
    const preview = await prepareToolOutput(output, 4000, directory);
    expect(preview.length).toBeLessThanOrEqual(4000);
    expect(preview.startsWith("Build started")).toBe(true);
    expect(preview.endsWith("ERROR: build failed")).toBe(true);
    expect(preview).toContain("1002 lines");
    expect(preview).toContain("offset and limit");
    const files = await readdir(directory);
    expect(files).toHaveLength(1);
    const file = path.join(directory, files[0]!);
    expect(preview).toContain(JSON.stringify(file));
    expect(await readFile(file, "utf8")).toBe(output);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("save failures do not hide the tool failure", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "cagent-output-"));
  try {
    const file = path.join(directory, "not-a-directory");
    await writeFile(file, "occupied");
    const preview = await prepareToolOutput(
      `${"x".repeat(5000)}FAILED`,
      4000,
      file,
    );
    expect(preview).toContain("Could not save full output");
    expect(preview.endsWith("FAILED")).toBe(true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("output budget follows the context window with bounded defaults", () => {
  expect(toolOutputLimit()).toBe(4000);
  expect(toolOutputLimit(100_000)).toBe(4000);
  expect(toolOutputLimit(200_000)).toBe(8000);
  expect(toolOutputLimit(8000)).toBe(512);
  expect(toolOutputLimit(1_000_000)).toBe(16_000);
  expect(toolOutputLimit(Number.NaN)).toBe(4000);
});
