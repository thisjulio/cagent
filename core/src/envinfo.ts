import { execFileSync } from "node:child_process";
import os from "node:os";
import { parseGitInfo } from "./gitinfo";

function gitFact(cwd: string): string {
  try {
    const status = execFileSync(
      "git",
      ["status", "--porcelain=v2", "--branch"],
      {
        cwd,
        encoding: "utf-8",
        env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
        timeout: 2000,
        maxBuffer: 10 * 1024 * 1024,
        stdio: ["ignore", "pipe", "ignore"],
      },
    );
    const info = parseGitInfo(status);
    if (!info.isRepo) return "Git repo: no";
    const branch = info.branch ?? "detached HEAD";
    return `Git repo: yes (branch ${branch}; ${info.dirty} changed files at session start)`;
  } catch {
    return "Git repo: no";
  }
}

export function envFacts(cwd: string): string {
  const lines = [
    `System: ${os.platform()} ${os.release()}`,
    `Shell: ${process.env.SHELL ?? "unknown"}`,
    `CWD: ${cwd}`,
    `Date/time: ${new Date().toISOString()} (UTC)`,
    `Local timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`,
    gitFact(cwd),
  ];
  return lines.join("\n");
}
