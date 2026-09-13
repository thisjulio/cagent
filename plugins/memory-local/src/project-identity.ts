import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import path from "node:path";

export function projectIdentity(cwd = process.cwd()): string {
  const root = git(cwd, ["rev-parse", "--show-toplevel"]);
  const remote = root && git(root, ["config", "--get", "remote.origin.url"]);
  if (root) return `git:${root}:${remote ?? "no-remote"}`;
  return `path:${path.resolve(cwd)}:${fallbackProjectId(cwd)}`;
}

export function fallbackProjectId(cwd = process.cwd()): string {
  return crypto.createHash("sha256").update(path.resolve(cwd)).digest("hex").slice(0, 24);
}

function git(cwd: string, args: string[]): string | undefined {
  try { return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || undefined; } catch { return undefined; }
}
