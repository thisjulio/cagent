import type { Message } from "@cagent/sdk";

export function mergeSystemMessages(
  systemPrompt: string,
  messages: Message[],
): Message[] {
  const system = messages.filter((message) => message.role === "system");
  const rest = messages.filter((message) => message.role !== "system");
  const content = [systemPrompt, ...system.map((message) => message.content)]
    .filter(Boolean)
    .join("\n\n");
  return [{ role: "system", content }, ...rest];
}
