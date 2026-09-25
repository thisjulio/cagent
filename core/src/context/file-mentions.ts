import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import type { ContentPart, Message } from "@cagent/sdk";
import { fuzzy } from "../fuzzy";

const MENTION =
  /(^|\s)@((?:\.{0,2}\/)?[^\s:@]+(?:\/[^\s:@]+)*)(?::(\d+)(?:-(\d+))?)?/g;

export function listProjectFiles(cwd = process.cwd()): string[] {
  if (hasGitRoot(cwd))
    return readGitFiles(cwd, [
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
    ]);

  const output = spawnSync("rg", ["--files", "--hidden", "-g", "!.git"], {
    cwd,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (output.status !== 0) return [];
  const ignored = fs.existsSync(path.join(cwd, ".gitignore"))
    ? fs
        .readFileSync(path.join(cwd, ".gitignore"), "utf8")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"))
    : [];
  return output.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((file) => !ignored.some((pattern) => file === pattern));
}

function hasGitRoot(cwd: string): boolean {
  let directory = cwd;
  while (true) {
    if (fs.existsSync(path.join(directory, ".git"))) return true;
    const parent = path.dirname(directory);
    if (parent === directory) return false;
    directory = parent;
  }
}

function readGitFiles(cwd: string, args: string[]): string[] {
  const result = spawnSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  return result.status === 0
    ? result.stdout.split(/\r?\n/).filter(Boolean)
    : [];
}

export function fuzzyProjectFiles(
  query: string,
  cwd = process.cwd(),
): string[] {
  const files = listProjectFiles(cwd).sort();
  return (query ? fuzzy(files, query) : files).slice(0, 8);
}

export type FileMention = { path: string; start?: number; end?: number };

export function parseFileMentions(
  text: string,
  cwd = process.cwd(),
): FileMention[] {
  const known = new Set(
    listProjectFiles(cwd).map((file) => file.replaceAll("\\", "/")),
  );
  const mentions: FileMention[] = [];
  for (const match of text.matchAll(MENTION)) {
    const file = match[2].replaceAll("\\", "/").replace(/^\.\//, "");
    if (!known.has(file)) continue;
    const start = match[3] ? Number(match[3]) : undefined;
    const end = match[4] ? Number(match[4]) : start;
    mentions.push({ path: file, start, end });
  }
  return mentions;
}

export function buildFileContext(
  text: string,
  cwd = process.cwd(),
): {
  content: string;
  filePaths: string[];
  context: string;
} {
  const mentions = parseFileMentions(text, cwd);
  const filePaths = [...new Set(mentions.map((mention) => mention.path))];
  const context = mentions
    .map((mention) => {
      const absolute = path.resolve(cwd, mention.path);
      if (!absolute.startsWith(`${path.resolve(cwd)}${path.sep}`)) return "";
      try {
        const lines = fs.readFileSync(absolute, "utf8").split(/\r?\n/);
        const start = Math.max(1, mention.start ?? 1);
        const end = Math.min(lines.length, mention.end ?? lines.length);
        const selected = lines
          .slice(start - 1, end)
          .map((line, index) => `${start + index}: ${line}`)
          .join("\n");
        return `File: ${mention.path}${mention.start ? ` (lines ${start}-${end})` : ""}\n\`\`\`\n${selected}\n\`\`\``;
      } catch {
        return "";
      }
    })
    .filter(Boolean)
    .join("\n\n");
  const stripped = text
    .replace(MENTION, (whole, prefix: string, file: string) =>
      parseFileMentions(`@${file}`, cwd).length ? prefix : whole,
    )
    .trim();
  return { content: stripped || text, filePaths, context };
}

export function appendFileContext(
  content: string | ContentPart[],
  context: string,
): string | ContentPart[] {
  if (!context) return content;
  if (typeof content === "string") return `${content}\n\n${context}`;
  return [...content, { type: "text", text: `\n\n${context}` }];
}

export function withFileContext(
  messages: Message[],
  context: string,
): Message[] {
  if (!context) return messages;
  const index = messages.findLastIndex((message) => message.role === "user");
  if (index < 0) return messages;
  const result = [...messages];
  const message = result[index];
  result[index] = {
    ...message,
    content:
      typeof message.content === "string"
        ? `${message.content}\n\nReferenced file context:\n${context}`
        : [
            ...message.content.filter((part) => part.type !== "image_url"),
            { type: "text", text: `Referenced file context:\n${context}` },
            ...message.content.filter((part) => part.type === "image_url"),
          ],
  };
  return result;
}
