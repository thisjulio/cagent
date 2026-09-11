import fs from "node:fs";
import path from "node:path";

// ponytail: conversão gitignore→glob sem negação (!); negações entram quando o agente se deparar com elas
export function gitignorePatterns(cwd: string): string[] {
  const file = path.join(cwd, ".gitignore");
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      if (l.endsWith("/")) return `**/${l.replace(/\/$/, "")}/**`;
      if (l.startsWith("/")) return l.slice(1);
      if (l.includes("/")) return l;
      return `**/${l}`;
    });
}
