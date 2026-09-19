import type { Message, WorkflowEventPayload } from "@cagent/sdk";
import type { TurnOpts } from "./loop";

export function lastUserMessage(messages: Message[]): string | undefined {
  const userMsg = [...messages]
    .reverse()
    .find((message) => message.role === "user");
  if (!userMsg) return "";
  if (typeof userMsg.content === "string") return userMsg.content;
  return userMsg.content
    .map((p) => (p.type === "text" ? p.text : "[image]"))
    .join(" ");
}

export function workflowPayload(
  opts: TurnOpts,
  data: Record<string, unknown>,
): WorkflowEventPayload {
  return { version: 1, data };
}
