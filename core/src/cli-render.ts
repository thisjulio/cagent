import type { ChatItem } from "./controller/state";
import { plainLine } from "./ui/render/markdown";
import { redactCommand } from "./tool-preview";

const GRAY_ITALIC = "\u001b[3;90m";
const BOLD = "\u001b[1m";
const RESET = "\u001b[0m";

function prefixedLines(content: string, prefix: string): string {
  return content
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");
}

export function renderHumanHistory(
  items: ChatItem[],
  color = process.stdout.isTTY,
): string {
  let hasAgentLabel = false;
  return items
    .map((item) => {
      const rendered = renderItem(item, color, hasAgentLabel);
      if (item.kind === "user") hasAgentLabel = false;
      if (
        item.kind === "thinking" ||
        item.kind === "assistant" ||
        item.kind === "tool"
      )
        hasAgentLabel = true;
      return rendered;
    })
    .filter(Boolean)
    .join("\n");
}

function renderItem(
  item: ChatItem,
  color: boolean,
  hasAgentLabel: boolean,
): string {
  if (!item.content && item.kind !== "tool") return "";
  if (item.kind === "user") return `You\n└─ ${item.content}`;
  if (item.kind === "thinking") {
    const lines = item.content.split("\n").map(plainLine);
    const header = color ? `${BOLD}thinking${RESET}` : "thinking";
    const content = lines.map((line) => `│  ${line}`).join("\n");
    const styledContent = color ? `${GRAY_ITALIC}${content}${RESET}` : content;
    return `${hasAgentLabel ? "" : "cagent\n"}├─ ${header}\n${styledContent}`;
  }
  if (item.kind === "assistant")
    return `${hasAgentLabel ? "" : "cagent\n"}└─ ${item.content}`;
  if (item.kind === "tool") {
    const status = item.denied ? "✗" : item.isError ? "✗" : "⏺";
    const name = item.toolName ?? "tool";
    const label = item.title ?? (item.cmd ? `${name} · ${item.cmd}` : name);
    const command =
      item.title && item.cmd ? `\n│  └─ $ ${redactCommand(item.cmd)}` : "";
    const body = item.content ? `\n${prefixedLines(item.content, "│  ")}` : "";
    return `├─ ${status} ${item.title ? `${name} · ${label}` : label}${command}${body}`;
  }
  return item.content;
}
