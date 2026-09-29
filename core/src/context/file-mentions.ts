import fs from "node:fs";
import path from "node:path";
import type { ContentPart, Message } from "@cagent/sdk";
import {
  fuzzyProjectFiles as matchProjectFiles,
  loadProjectFiles,
} from "./file-index";

const MENTION =
  /(^|\s)@((?:\.{0,2}\/)?[^\s:@]+(?:\/[^\s:@]+)*)(?::(\d+)(?:-(\d+))?)?/g;

export function listProjectFiles(cwd = process.cwd()): Promise<string[]> {
  return loadProjectFiles(cwd);
}

export function fuzzyProjectFiles(
  query: string,
  cwd = process.cwd(),
): string[] {
  return matchProjectFiles(query, cwd);
}

export type FileMention = { path: string; start?: number; end?: number };

export async function parseFileMentions(
  text: string,
  cwd = process.cwd(),
): Promise<FileMention[]> {
  if (!/(^|\s)@/.test(text)) return [];
  const known = new Set((await listProjectFiles(cwd)).map(normalizeFilePath));
  return findFileMentions(text, known);
}

function findFileMentions(text: string, known: Set<string>): FileMention[] {
  const mentions: FileMention[] = [];
  for (const match of text.matchAll(MENTION)) {
    const file = normalizeFilePath(match[2]).replace(/^\.\//, "");
    if (!known.has(file)) continue;
    const start = match[3] ? Number(match[3]) : undefined;
    const end = match[4] ? Number(match[4]) : start;
    mentions.push({ path: file, start, end });
  }
  return mentions;
}

export const MAX_FILE_MENTION_CHARS = 6000;

export function fileContextCharLimit(contextWindow: number): number {
  return Math.max(1_000, Math.floor(contextWindow * 0.2 * 4));
}

export async function buildFileContext(
  text: string,
  cwd = process.cwd(),
  maxChars = fileContextCharLimit(100_000),
): Promise<{
  content: string;
  filePaths: string[];
  context: string;
}> {
  if (!/(^|\s)@/.test(text))
    return { content: text.trim() || text, filePaths: [], context: "" };
  const known = new Set((await listProjectFiles(cwd)).map(normalizeFilePath));
  const mentions = findFileMentions(text, known);
  const filePaths = [...new Set(mentions.map((mention) => mention.path))];
  let remaining = maxChars;
  const blocks: string[] = [];
  for (const mention of mentions) {
    const result = referencedFileContext(mention, cwd, remaining);
    remaining = result.remaining;
    if (result.content) blocks.push(result.content);
  }
  const context = blocks.join("\n\n");
  const stripped = text
    .replace(MENTION, (whole, prefix: string, file: string) =>
      known.has(normalizeFilePath(file).replace(/^\.\//, "")) ? prefix : whole,
    )
    .trim();
  return { content: stripped || text, filePaths, context };
}

function normalizeFilePath(file: string): string {
  return file.replaceAll("\\", "/");
}

function referencedFileContext(
  mention: FileMention,
  cwd: string,
  remaining: number,
): { content: string; remaining: number } {
  const absolute = path.resolve(cwd, mention.path);
  if (!absolute.startsWith(`${path.resolve(cwd)}${path.sep}`))
    return { content: "", remaining };
  try {
    const bytes = fs.readFileSync(absolute);
    if (bytes.includes(0)) return binaryFileContext(mention.path, remaining);
    return textFileContext(mention, bytes.toString("utf8"), remaining);
  } catch {
    return { content: "", remaining };
  }
}

function binaryFileContext(
  file: string,
  remaining: number,
): { content: string; remaining: number } {
  const content = `File: ${file} omitted (binary file). Use read_file if needed.`;
  return content.length > remaining
    ? { content: "", remaining }
    : { content, remaining: remaining - content.length - 2 };
}

function textFileContext(
  mention: FileMention,
  content: string,
  remaining: number,
): { content: string; remaining: number } {
  const lines = content.split(/\r?\n/);
  const start = Math.max(1, mention.start ?? 1);
  const end = Math.min(lines.length, mention.end ?? lines.length);
  const selectedLines = lines
    .slice(start - 1, end)
    .map((line, index) => `${start + index}: ${line}`);
  const header = `File: ${mention.path}${mention.start ? ` (lines ${start}-${end})` : ""}`;
  const room = Math.min(
    Math.max(0, remaining - header.length - 96),
    Math.max(0, MAX_FILE_MENTION_CHARS - header.length - 96),
  );
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
  return { content: block, remaining: remaining - block.length - 2 };
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
