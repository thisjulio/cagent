import type { Message } from "@cagent/sdk";

export const DEFAULT_MAX_INPUT_TOKENS_PER_TURN = 150_000;

export function budgetError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

export function estimateMessageTokens(messages: Message[]): number {
  const chars = messages.reduce((total, message) => {
    const content =
      typeof message.content === "string"
        ? message.content.length
        : message.content.reduce(
            (sum, part) =>
              sum + (part.type === "text" ? part.text.length : 400),
            0,
          );
    const calls = message.tool_calls
      ? JSON.stringify(message.tool_calls).length
      : 0;
    return total + content + calls;
  }, 0);
  return Math.ceil(chars / 4);
}
