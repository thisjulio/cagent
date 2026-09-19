import { execSync } from "child_process";
import path from "path";
import os from "os";

export interface GitInfo {
  branch: string | null;
  ahead: number;
  behind: number;
  dirty: number;
  isRepo: boolean;
}

export function getGitInfo(cwd: string): GitInfo {
  const info: GitInfo = {
    branch: null,
    ahead: 0,
    behind: 0,
    dirty: 0,
    isRepo: false,
  };

  try {
    const root = execSync("git rev-parse --show-toplevel 2>/dev/null", {
      cwd,
      encoding: "utf-8",
      timeout: 3000,
    }).trim();
    if (!root) return info;

    info.isRepo = true;

    info.branch =
      execSync("git branch --show-current 2>/dev/null", {
        cwd,
        encoding: "utf-8",
        timeout: 3000,
      }).trim() || null;

    const status = execSync("git status --porcelain 2>/dev/null", {
      cwd,
      encoding: "utf-8",
      timeout: 3000,
    }).trim();
    info.dirty = status ? status.split("\n").length : 0;

    const upstream = execSync(
      "git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null || true",
      { cwd, encoding: "utf-8", timeout: 3000 },
    ).trim();
    if (upstream) {
      const counts = execSync(
        "git rev-list --left-right --count HEAD...@{u} 2>/dev/null",
        {
          cwd,
          encoding: "utf-8",
          timeout: 3000,
        },
      ).trim();
      const [ahead, behind] = counts.split("\t").map(Number);
      info.ahead = ahead || 0;
      info.behind = behind || 0;
    }
  } catch {
    // Not a git repo or git failed — return defaults
  }

  return info;
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
