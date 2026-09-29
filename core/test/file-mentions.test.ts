import { describe, expect, it } from "bun:test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildFileContext,
  fuzzyProjectFiles,
  listProjectFiles,
  withFileContext,
} from "../src/context/file-mentions";
import {
  hasProjectFiles,
  invalidateProjectFiles,
} from "../src/context/file-index";

function project(): string {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "cagent-files-"));
  fs.writeFileSync(
    path.join(cwd, ".gitignore"),
    "ignored.txt\nignored-*.txt\n",
  );
  fs.writeFileSync(path.join(cwd, "source.ts"), "first\nsecond\nthird\n");
  fs.writeFileSync(path.join(cwd, "ignored.txt"), "secret\n");
  fs.writeFileSync(path.join(cwd, "ignored-secret.txt"), "secret\n");
  fs.writeFileSync(path.join(cwd, "large.txt"), "x".repeat(10_000));
  fs.writeFileSync(
    path.join(cwd, "image.png"),
    Buffer.from([137, 80, 78, 71, 0, 1]),
  );
  execFileSync("git", ["init", "-q"], { cwd });
  return cwd;
}

describe("file mentions", () => {
  it("lists fuzzy project files and respects gitignore patterns", async () => {
    const cwd = project();
    await listProjectFiles(cwd);
    expect(fuzzyProjectFiles("s", cwd)).toEqual(["source.ts"]);
    expect(fuzzyProjectFiles("sc", cwd)).toEqual(["source.ts"]);
    expect(fuzzyProjectFiles("sct", cwd)).toEqual(["source.ts"]);
    const files = await listProjectFiles(cwd);
    expect(files).not.toContain("ignored.txt");
    expect(files).not.toContain("ignored-secret.txt");
  });

  it("extracts a referenced line range and removes the mention from the prompt", async () => {
    const cwd = project();
    const result = await buildFileContext("Review @source.ts:2-3 please", cwd);
    expect(result.content).toBe("Review  please");
    expect(result.filePaths).toEqual(["source.ts"]);
    expect(result.context).toContain("2: second");
    expect(result.context).toContain("3: third");
    expect(result.context).not.toContain("1: first");
  });

  it("caps file content and instructs the model to use read_file", async () => {
    const result = await buildFileContext("Inspect @large.txt", project(), 250);
    expect(result.context.length).toBeLessThanOrEqual(250);
    expect(result.context).toContain("Use read_file");
  });

  it("does not inline binary files", async () => {
    const result = await buildFileContext("Inspect @image.png", project());
    expect(result.context).toContain("omitted (binary file)");
    expect(result.context).not.toContain("PNG");
  });

  it("does not append context to the same message more than once", () => {
    const messages = [{ role: "user" as const, content: "Review" }];
    const once = withFileContext(messages, "File: source.ts");
    const twice = withFileContext(once, "File: source.ts");
    expect(twice).toBe(once);
  });

  it("does not load the project index when a prompt has no file mention", async () => {
    const cwd = project();
    expect(hasProjectFiles(cwd)).toBe(false);
    await buildFileContext("plain prompt", cwd);
    expect(hasProjectFiles(cwd)).toBe(false);
  });

  it("refreshes cached file suggestions after a workspace write", async () => {
    const cwd = project();
    await listProjectFiles(cwd);
    expect(fuzzyProjectFiles("crt", cwd)).toEqual([]);
    fs.writeFileSync(path.join(cwd, "created.ts"), "new\n");
    invalidateProjectFiles(cwd);

    expect(await listProjectFiles(cwd)).toContain("created.ts");
    expect(fuzzyProjectFiles("crt", cwd)).toEqual(["created.ts"]);
  });
});
