import type { ChatItem } from "./controller/state";
import { plainLine } from "./ui/render/markdown";

const GRAY_ITALIC = "\u001b[3;90m";
const BOLD = "\u001b[1m";
const RESET = "\u001b[0m";

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
    const command = item.cmd ? ` · ${item.cmd}` : "";
    const body = item.content
      ? `\n│  ${item.content.replaceAll("\n", "\n│  ")}`
      : "";
    return `├─ ${status} ${name}${command}${body}`;
  }
  return item.content;
}
