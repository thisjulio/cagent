import fs from "node:fs";
import path from "node:path";
import type { ContentPart, Message } from "@cagent/sdk";
import { fuzzy } from "../fuzzy";
import { projectFiles } from "./file-index";

const MENTION =
  /(^|\s)@((?:\.{0,2}\/)?[^\s:@]+(?:\/[^\s:@]+)*)(?::(\d+)(?:-(\d+))?)?/g;

export function listProjectFiles(cwd = process.cwd()): string[] {
  return projectFiles(cwd);
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

export function fileContextCharLimit(contextWindow: number): number {
  return Math.max(1_000, Math.floor(contextWindow * 0.2 * 4));
}

export function buildFileContext(
  text: string,
  cwd = process.cwd(),
  maxChars = fileContextCharLimit(100_000),
): {
  content: string;
  filePaths: string[];
  context: string;
} {
  const mentions = parseFileMentions(text, cwd);
  const filePaths = [...new Set(mentions.map((mention) => mention.path))];
  let remaining = maxChars;
  const context = mentions
    .map((mention) => {
      const absolute = path.resolve(cwd, mention.path);
      if (!absolute.startsWith(`${path.resolve(cwd)}${path.sep}`)) return "";
      try {
        const bytes = fs.readFileSync(absolute);
        if (bytes.includes(0)) {
          const omitted = `File: ${mention.path} omitted (binary file). Use read_file if needed.`;
          if (omitted.length > remaining) return "";
          remaining -= omitted.length + 2;
          return omitted;
        }
        const lines = bytes.toString("utf8").split(/\r?\n/);
        const start = Math.max(1, mention.start ?? 1);
        const end = Math.min(lines.length, mention.end ?? lines.length);
        const selectedLines = lines
          .slice(start - 1, end)
          .map((line, index) => `${start + index}: ${line}`);
        const header = `File: ${mention.path}${mention.start ? ` (lines ${start}-${end})` : ""}`;
        const room = Math.max(0, remaining - header.length - 96);
        let selected = "";
        for (const line of selectedLines) {
          if (selected.length + line.length + 1 > room) break;
          selected += `${selected ? "\n" : ""}${line}`;
        }
        const truncated = selected.length < selectedLines.join("\n").length;
        const suffix = truncated
          ? "\n[File context truncated. Use read_file to inspect the remaining content.]"
          : "";
        const block = `${header}\n\`\`\`\n${selected}${suffix}\n\`\`\``;
        remaining -= block.length + 2;
        return block;
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
  const existingText =
    typeof message.content === "string"
      ? message.content
      : message.content
          .filter((part) => part.type === "text")
          .map((part) => part.text)
          .join("\n");
  if (existingText.includes("Referenced file context:")) return messages;
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
