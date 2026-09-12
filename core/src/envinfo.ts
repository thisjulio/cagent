import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function envFacts(cwd: string): string {
  const lines = [
    `System: ${os.platform()} ${os.release()}`,
    `Shell: ${process.env.SHELL ?? "unknown"}`,
    `CWD: ${cwd}`,
    `Date/time: ${new Date().toISOString()} (UTC)`,
    `Local timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`,
    `Git repo: ${fs.existsSync(path.join(cwd, ".git")) ? "yes" : "no"}`,
  ];
  return lines.join("\n");
}
