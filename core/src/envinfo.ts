import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function envFacts(cwd: string): string {
  const lines = [
    `Sistema: ${os.platform()} ${os.release()}`,
    `Shell: ${process.env.SHELL ?? "desconhecido"}`,
    `CWD: ${cwd}`,
    `Data/hora: ${new Date().toISOString()} (UTC)`,
    `Fuso local: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`,
    `Repo git: ${fs.existsSync(path.join(cwd, ".git")) ? "sim" : "não"}`,
  ];
  return lines.join("\n");
}
