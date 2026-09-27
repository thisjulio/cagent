import type { Message } from "@cagent/sdk";
import { recentContext } from "./recent-context";

export type RequestWindowOptions = {
  contextWindow: number;
  reserveTokens?: number;
  systemTokens?: number;
  toolTokens?: number;
  toolLimitTokens?: number;
  recentMessages?: number;
};

export type RequestWindow = {
  messages: Message[];
  included: number;
  omitted: number;
  recentTurns: number;
};

function estimateTokens(messages: Message[]): number {
  const chars = messages.reduce((total, message) => {
    const content =
      typeof message.content === "string"
        ? message.content.length
        : message.content.reduce(
            (sum, part) =>
              sum + (part.type === "text" ? part.text.length : 400),
            0,
          );
    return total + content;
  }, 0);
  return Math.ceil(chars / 4);
}

// ponytail: system messages stay out of the sliding window; only the
// conversational tail is budgeted so a long session costs recent turns,
// not the full transcript, on every step.
export function selectRequestWindow(
  messages: Message[],
  opts: RequestWindowOptions,
): RequestWindow {
  const total = messages.length;
  const system = messages.filter((message) => message.role === "system");
  const rest = messages.filter((message) => message.role !== "system");
  const systemTokens = opts.systemTokens ?? Math.max(estimateTokens(system), 1);
  const toolTokens = opts.toolTokens ?? 0;
  const reserve = opts.reserveTokens ?? 8000;
  const budget = Math.max(
    1,
    opts.contextWindow - systemTokens - toolTokens - reserve,
  );
  const windowed = recentContext(rest, budget, opts.toolLimitTokens ?? 2000);
  const recentCount = opts.recentMessages ?? 24;
  const included = [...system, ...windowed];
  return {
    messages: included,
    included: included.length,
    omitted: Math.max(0, total - included.length),
    recentTurns: Math.min(windowed.length, recentCount),
  };
}
