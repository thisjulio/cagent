import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { restoreShadow, shadowCommit } from "../src/git-shadow";
import { restoreCheckpoint } from "../src/checkpoints";

let cwd: string;
let dir: string;
beforeEach(() => {
  cwd = process.cwd();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "cagent-checkpoints-"));
  process.chdir(dir);
});
afterEach(() => {
  process.chdir(cwd);
  fs.rmSync(dir, { recursive: true, force: true });
});

function git(...args: string[]) {
  const result = spawnSync("git", args, { cwd: dir, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout;
}

describe("workspace checkpoints", () => {
  test("works in Git workspaces without modifying the user's index", () => {
    git("init");
    fs.writeFileSync("file.txt", "staged");
    git("add", "file.txt");
    const index = fs.readFileSync(".git/index");
    fs.writeFileSync("file.txt", "dirty baseline");
    fs.writeFileSync(".gitignore", "ignored.txt\n");
    fs.writeFileSync("ignored.txt", "private");
    fs.writeFileSync(".env", "TOKEN=private");
    const before = shadowCommit("before");
    fs.writeFileSync("file.txt", "agent edit");
    fs.writeFileSync("created.txt", "created");
    const after = shadowCommit("after");
    fs.writeFileSync("unrelated.txt", "user edit");
    restoreShadow(before, after);
    expect(fs.readFileSync("file.txt", "utf8")).toBe("dirty baseline");
    expect(fs.existsSync("created.txt")).toBe(false);
    expect(fs.readFileSync("unrelated.txt", "utf8")).toBe("user edit");
    expect(fs.readFileSync(".git/index")).toEqual(index);
    const files = git(
      "--git-dir",
      ".cagent/.shadow/git",
      "ls-tree",
      "-r",
      "--name-only",
      before,
    );
    expect(files).not.toContain(".env");
    expect(files).not.toContain("ignored.txt");
    expect(files).not.toContain(".git/");
    expect(files).not.toContain(".cagent/");
  });
  test("preflights unrelated edits before restoring any file", () => {
    fs.writeFileSync("a.txt", "a");
    fs.writeFileSync("b.txt", "b");
    const before = shadowCommit("before");
    fs.writeFileSync("a.txt", "agent");
    fs.writeFileSync("b.txt", "agent");
    const after = shadowCommit("after");
    fs.writeFileSync("b.txt", "user");
    expect(() => restoreShadow(before, after)).toThrow("Unrelated edits");
    expect(fs.readFileSync("a.txt", "utf8")).toBe("agent");
  });
  test("validates commands and persists restore hashes in the session", () => {
    fs.writeFileSync("a.txt", "baseline");
    const before = shadowCommit("before");
    fs.writeFileSync("a.txt", "agent");
    const after = shadowCommit("after");
    const records = [
      { type: "user", turnId: "turn-1", payload: {} },
      {
        type: "meta",
        turnId: "turn-1",
        payload: { kind: "workspace-checkpoint", hash: before },
      },
      {
        type: "meta",
        turnId: "turn-1",
        payload: { kind: "workspace-turn-completed", hash: after },
      },
    ];
    const context = {
      name: "undo",
      arguments: "",
      values: {},
      sessionId: "session",
      records,
      restoreConversation: (
        _turnId: string,
        payload: Record<string, unknown>,
      ) => {
        records.splice(0);
        records.push({ type: "meta", turnId: "", payload });
      },
    };
    expect(() => restoreCheckpoint({ ...context, activeTurn: true })).toThrow(
      "active turn",
    );
    expect(() =>
      restoreCheckpoint({ ...context, name: "rewind", arguments: "0" }),
    ).toThrow("Usage");
    expect(restoreCheckpoint(context)).toContain("turn 1");
    expect(records.at(-1)?.payload.hash).toBe(before);
    expect(() => restoreCheckpoint(context)).toThrow("No restorable");
  });
  test("rolls back binary files, executable modes, creations and deletions when conversation commit fails", () => {
    const binary = Buffer.from([0, 255, 128, 10]);
    fs.writeFileSync("deleted.bin", binary);
    fs.writeFileSync("script", "before", { mode: 0o755 });
    const before = shadowCommit("before");
    fs.unlinkSync("deleted.bin");
    fs.writeFileSync("created.bin", binary);
    fs.writeFileSync("script", "after");
    fs.chmodSync("script", 0o644);
    const after = shadowCommit("after");
    expect(() =>
      restoreShadow(before, after, () => {
        throw new Error("Persistence failed");
      }),
    ).toThrow("Persistence failed");
    expect(fs.existsSync("deleted.bin")).toBe(false);
    expect(fs.readFileSync("created.bin")).toEqual(binary);
    expect(fs.readFileSync("script", "utf8")).toBe("after");
    expect(fs.statSync("script").mode & 0o777).toBe(0o644);
    restoreShadow(before, after);
    expect(fs.readFileSync("deleted.bin")).toEqual(binary);
    expect(fs.existsSync("created.bin")).toBe(false);
    expect(fs.readFileSync("script", "utf8")).toBe("before");
    expect(fs.statSync("script").mode & 0o777).toBe(0o755);
  });
});
