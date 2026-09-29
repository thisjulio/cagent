import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import os from "os";

export interface GitInfo {
  branch: string | null;
  ahead: number;
  behind: number;
  dirty: number;
  isRepo: boolean;
}

const execFileAsync = promisify(execFile);
const gitReadEnv = { ...process.env, GIT_OPTIONAL_LOCKS: "0" };

export async function getGitInfoAsync(cwd: string): Promise<GitInfo> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["status", "--porcelain=v2", "--branch"],
      {
        cwd,
        encoding: "utf-8",
        env: gitReadEnv,
        timeout: 3000,
        maxBuffer: 10 * 1024 * 1024,
      },
    );
    return parseGitInfo(stdout);
  } catch {
    return emptyGitInfo();
  }
}

export function parseGitInfo(status: string): GitInfo {
  const info = emptyGitInfo();
  const lines = status.split("\n");
  const branch = lines.find((line) => line.startsWith("# branch.head "));
  if (!branch) return info;

  info.isRepo = true;
  const head = branch.slice("# branch.head ".length);
  info.branch = head === "(detached)" || head === "(initial)" ? null : head;
  info.dirty = lines.filter((line) => line && !line.startsWith("# ")).length;
  const counts = lines.find((line) => line.startsWith("# branch.ab "));
  const aheadBehind = counts?.match(/^# branch\.ab \+(\d+) -(\d+)$/);
  if (aheadBehind) {
    info.ahead = Number(aheadBehind[1]);
    info.behind = Number(aheadBehind[2]);
  }
  return info;
}

function emptyGitInfo(): GitInfo {
  return { branch: null, ahead: 0, behind: 0, dirty: 0, isRepo: false };
}

export function getGitBranch(cwd: string): string | null {
  try {
    return (
      execFileSync("git", ["branch", "--show-current"], {
        cwd,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 3000,
      }).trim() || null
    );
  } catch {
    return null;
  }
}

export function formatCwd(cwd: string): string {
  const home = os.homedir();
  if (cwd.startsWith(home)) {
    return "~" + cwd.slice(home.length);
  }
  return cwd;
}

export function formatGitBadge(info: GitInfo): string {
  if (!info.isRepo || !info.branch) return "";
  let badge = `⎇ ${info.branch}`;
  if (info.ahead > 0) badge += ` ↑${info.ahead}`;
  if (info.behind > 0) badge += ` ↓${info.behind}`;
  if (info.dirty > 0) badge += ` ⚠${info.dirty}`;
  return badge;
}
