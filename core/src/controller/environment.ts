import type { Message } from "@cagent/sdk";

export function addEnvironmentContext(
  messages: Message[],
  stamp: number,
): number {
  if (Date.now() - stamp < 30 * 60_000) return stamp;
  messages.push({
    role: "user",
    content: `[context] Date/time: ${new Date().toISOString()} (UTC); timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`,
  });
  return Date.now();
}
