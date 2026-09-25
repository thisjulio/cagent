import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildFileContext,
  fuzzyProjectFiles,
  listProjectFiles,
  withFileContext,
} from "../src/context/file-mentions";

function project(): string {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "cagent-files-"));
  fs.writeFileSync(path.join(cwd, ".gitignore"), "ignored.txt\n");
  fs.writeFileSync(path.join(cwd, "source.ts"), "first\nsecond\nthird\n");
  fs.writeFileSync(path.join(cwd, "ignored.txt"), "secret\n");
  fs.writeFileSync(path.join(cwd, "large.txt"), "x".repeat(10_000));
  fs.writeFileSync(
    path.join(cwd, "image.png"),
    Buffer.from([137, 80, 78, 71, 0, 1]),
  );
  return cwd;
}

describe("file mentions", () => {
  it("lists fuzzy project files and respects .gitignore", () => {
    const cwd = project();
    expect(fuzzyProjectFiles("sct", cwd)).toEqual(["source.ts"]);
    expect(listProjectFiles(cwd)).not.toContain("ignored.txt");
  });

  it("extracts a referenced line range and removes the mention from the prompt", () => {
    const cwd = project();
    const result = buildFileContext("Review @source.ts:2-3 please", cwd);
    expect(result.content).toBe("Review  please");
    expect(result.filePaths).toEqual(["source.ts"]);
    expect(result.context).toContain("2: second");
    expect(result.context).toContain("3: third");
    expect(result.context).not.toContain("1: first");
  });

  it("caps file content and instructs the model to use read_file", () => {
    const result = buildFileContext("Inspect @large.txt", project(), 250);
    expect(result.context.length).toBeLessThanOrEqual(250);
    expect(result.context).toContain("Use read_file");
  });

  it("does not inline binary files", () => {
    const result = buildFileContext("Inspect @image.png", project());
    expect(result.context).toContain("omitted (binary file)");
    expect(result.context).not.toContain("PNG");
  });

  it("does not append context to the same message more than once", () => {
    const messages = [{ role: "user" as const, content: "Review" }];
    const once = withFileContext(messages, "File: source.ts");
    const twice = withFileContext(once, "File: source.ts");
    expect(twice).toBe(once);
  });
});
