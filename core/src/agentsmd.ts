import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function loadAgentsMd(cwd: string, instructions: string[] = []): string | null {
  const parts: string[] = [];
  for (const project of findProjectDocs(cwd)) {
    parts.push(`# ${path.basename(project.file)} (project: ${project.file})\n${project.content}`);
  }
  for (const rule of findScopedRules(cwd)) {
    parts.push(`# scoped rule (${rule.file})\n${rule.content}`);
  }
  for (const file of [path.join(os.homedir(), ".cagent", "AGENTS.md")]) {
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

function findProjectDocs(cwd: string): { file: string; content: string }[] {
  const dirs: string[] = [];
  let dir = path.resolve(cwd);
  for (;;) {
    dirs.unshift(dir);
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const docs: { file: string; content: string }[] = [];
  for (const current of dirs) {
    const agents = path.join(current, "AGENTS.md");
    if (fs.existsSync(agents)) docs.push({ file: agents, content: fs.readFileSync(agents, "utf8") });
  }
  return docs;
}

function findScopedRules(cwd: string): { file: string; content: string }[] {
  const rules: { file: string; content: string }[] = [];
  for (const dir of ancestorDirs(cwd)) {
    for (const root of [".cagent/rules"]) {
      const directory = path.join(dir, root);
      if (!fs.existsSync(directory)) continue;
      for (const file of walkMarkdown(directory).sort()) {
        const raw = fs.readFileSync(file, "utf8");
        const frontmatter = parseFrontmatter(raw);
        if (frontmatter.paths && !frontmatter.paths.some((pattern) => matches(pattern, path.relative(dir, cwd)))) continue;
        rules.push({ file, content: frontmatter.content });
      }
    }
  }
  return rules;
}

function ancestorDirs(cwd: string): string[] {
  const dirs: string[] = [];
  let dir = path.resolve(cwd);
  for (;;) {
    dirs.unshift(dir);
    const parent = path.dirname(dir);
    if (parent === dir) return dirs;
    dir = parent;
  }
}

function walkMarkdown(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? walkMarkdown(file) : entry.name.endsWith(".md") ? [file] : [];
  });
}

function parseFrontmatter(raw: string): { paths?: string[]; content: string } {
  if (!raw.startsWith("---\n")) return { content: raw };
  const end = raw.indexOf("\n---", 4);
  if (end < 0) return { content: raw };
  const header = raw.slice(4, end).split("\n");
  const paths = header.find((line) => line.startsWith("paths:"))?.slice(6).trim();
  const values = paths?.replace(/^\[|\]$/g, "").split(",").map((value) => value.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean);
  return { paths: values, content: raw.slice(end + 4).replace(/^\n/, "") };
}

function matches(pattern: string, value: string): boolean {
  const expression = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]");
  return new RegExp(`^${expression}$`).test(value);
}
