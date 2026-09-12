import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// ponytail: walk up parent directories for the first AGENTS.md/CLAUDE.md (AGENTS wins in the same directory); nested precedence follows Codex if subprojects are imported.
export function loadAgentsMd(cwd: string, instructions: string[] = []): string | null {
  const parts: string[] = [];
  const project = findProjectDoc(cwd);
  if (project) parts.push(`# ${path.basename(project.file)} (projeto: ${project.file})\n${project.content}`);
  for (const file of [
    path.join(os.homedir(), ".cagent", "AGENTS.md"),
    path.join(os.homedir(), ".claude", "CLAUDE.md"),
  ]) {
    if (fs.existsSync(file)) {
      parts.push(`# ${path.basename(file)} (global: ${file})\n${fs.readFileSync(file, "utf8")}`);
      break;
    }
  }
  for (const inc of instructions) {
    const file = path.isAbsolute(inc) ? inc : path.join(cwd, inc);
    if (!fs.existsSync(file)) continue;
    parts.push(`# instructions (${file})\n${fs.readFileSync(file, "utf8")}`);
  }
  return parts.length ? parts.join("\n\n") : null;
}

function findProjectDoc(cwd: string): { file: string; content: string } | null {
  let dir = cwd;
  for (;;) {
    const agents = path.join(dir, "AGENTS.md");
    if (fs.existsSync(agents)) return { file: agents, content: fs.readFileSync(agents, "utf8") };
    const claude = path.join(dir, "CLAUDE.md");
    if (fs.existsSync(claude)) return { file: claude, content: fs.readFileSync(claude, "utf8") };
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
