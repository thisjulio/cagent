import { afterEach, beforeEach, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ensureShadow } from "../src/git-shadow";

let cwd: string;
let directory: string;
beforeEach(() => {
  cwd = process.cwd();
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "shadow-ignore-"));
  process.chdir(directory);
});
afterEach(() => {
  process.chdir(cwd);
  fs.rmSync(directory, { recursive: true, force: true });
});
function git(...args: string[]): string {
  const result = spawnSync("git", args, {
    encoding: "utf8",
    env: Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")),
    ),
  });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

test("creation and reuse ignore shadow locally without touching project rules", () => {
  git("init");
  fs.writeFileSync(".gitignore", "existing-rule\n");
  fs.writeFileSync(".git/info/exclude", "# existing comment");
  ensureShadow();
  expect(git("check-ignore", ".cagent/.shadow/git/HEAD")).toBe(
    ".cagent/.shadow/git/HEAD",
  );
  expect(fs.readFileSync(".gitignore", "utf8")).toBe("existing-rule\n");
  const exclude = fs.readFileSync(".git/info/exclude", "utf8");
  ensureShadow();
  expect(fs.readFileSync(".git/info/exclude", "utf8")).toBe(exclude);
  fs.writeFileSync(".git/info/exclude", "# reset\n");
  ensureShadow();
  expect(git("check-ignore", ".cagent/.shadow/git/HEAD")).toBe(
    ".cagent/.shadow/git/HEAD",
  );
});

test("nested workspace ignores only its own shadow", () => {
  git("init");
  fs.mkdirSync("nested");
  process.chdir("nested");
  ensureShadow();
  expect(git("check-ignore", ".cagent/.shadow/git/HEAD")).toBe(
    ".cagent/.shadow/git/HEAD",
  );
  expect(
    fs.readFileSync(path.join(directory, ".git/info/exclude"), "utf8"),
  ).toContain("/nested/.cagent/.shadow/");
});

test("linked worktree resolves its local Git exclude path", () => {
  git("init");
  git(
    "-c",
    "user.name=Test",
    "-c",
    "user.email=test@example.com",
    "commit",
    "--allow-empty",
    "-m",
    "Initial commit",
  );
  git("worktree", "add", "--detach", "linked");
  process.chdir("linked");
  ensureShadow();
  expect(git("check-ignore", ".cagent/.shadow/git/HEAD")).toBe(
    ".cagent/.shadow/git/HEAD",
  );
});

test("non-Git workspace still creates the shadow", () => {
  ensureShadow();
  expect(fs.existsSync(".cagent/.shadow/git/HEAD")).toBe(true);
  expect(fs.existsSync(".git")).toBe(false);
});
