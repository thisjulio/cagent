import fs from "node:fs";
import path from "node:path";
import { root } from "./state";
import { runCmd } from "./exec";

// ponytail: shadow only in non-Git workspaces; Git uses --work-tree=root() and --git-dir=.cagent/.shadow/.git.
let ready: boolean | undefined;

async function isGitWorkspace(): Promise<boolean> {
  const r = await runCmd("git", ["rev-parse", "--is-inside-work-tree"], { cwd: root() });
  return r.code === 0;
}

function shadowArgs(sub: string, extra: string[]): string[] {
  const ROOT = root();
  return ["--git-dir", path.join(ROOT, ".cagent", ".shadow", ".git"), "--work-tree", ROOT, sub, ...extra];
}

export async function ensureShadow(): Promise<void> {
  if (await isGitWorkspace()) return;
  if (ready) return;
  const gitDir = path.join(root(), ".cagent", ".shadow", ".git");
  fs.mkdirSync(path.dirname(gitDir), { recursive: true });
  await runCmd("git", ["init"], { cwd: path.dirname(gitDir) });
  await runCmd("git", shadowArgs("commit", ["--allow-empty", "-m", "cagent shadow init"]));
  ready = true;
}

export async function shadowCommit(label: string): Promise<void> {
  if (await isGitWorkspace()) return;
  await runCmd("git", shadowArgs("add", ["-A"]), { timeoutMs: 60_000 });
  await runCmd("git", shadowArgs("commit", ["-m", label]), { timeoutMs: 60_000 });
}
