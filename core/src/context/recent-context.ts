import type { Message } from "@cagent/sdk";

const CHARS_PER_TOKEN = 4;

export function recentContext(
  messages: Message[],
  budgetTokens: number,
  toolLimitTokens: number,
  forceReduction = false,
): Message[] {
  const budget = Math.max(1, budgetTokens);
  const blocks = messageBlocks(messages);
  const selected: Message[][] = [];
  let used = 0;

  for (let index = blocks.length - 1; index >= 0; index--) {
    const block = pruneToolOutputs(blocks[index]!, toolLimitTokens);
    const cost = estimateMessages(block);
    if (selected.length > 0 && used + cost > budget) break;
    selected.unshift(block);
    used += cost;
  }
  if (
    forceReduction &&
    selected.length === blocks.length &&
    selected.length > 1
  )
    selected.shift();
  return selected.flat();
}

function messageBlocks(messages: Message[]): Message[][] {
  const blocks: Message[][] = [];
  let current: Message[] = [];
  for (const message of messages) {
    if (message.role === "user" && current.length) {
      blocks.push(current);
      current = [];
    }
    current.push(message);
  }
  if (current.length) blocks.push(current);
  return blocks;
}

function pruneToolOutputs(
  messages: Message[],
  toolLimitTokens: number,
): Message[] {
  const limit = Math.max(1, toolLimitTokens) * CHARS_PER_TOKEN;
  return messages.map((message) => {
    if (
      message.role !== "tool" ||
      typeof message.content !== "string" ||
      message.content.length <= limit
    )
      return message;
    return {
      ...message,
      content: `${message.content.slice(0, limit)}\n[older tool output pruned]`,
    };
  });
}

function estimateMessages(messages: Message[]): number {
  return Math.ceil(
    messages.reduce((total, message) => {
      const content =
        typeof message.content === "string"
          ? message.content.length
          : message.content.reduce(
              (sum, part) =>
                sum + (part.type === "text" ? part.text.length : 4000),
              0,
            );
      const calls = message.tool_calls
        ? JSON.stringify(message.tool_calls).length
        : 0;
      return total + content + calls;
    }, 0) / CHARS_PER_TOKEN,
  );
}
