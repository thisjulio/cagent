import type { Message } from "@cagent/sdk";
import type { SessionRecord } from "./types";

export function recordsToMessages(records: SessionRecord[]): Message[] {
  const messages: Message[] = [];
  for (const record of records) {
    const payload = record.payload;
    if (record.type === "meta" && payload.kind === "skill-activated") {
      if (payload.format !== "tool-v1") messages.push(skillMessage(payload));
    } else if (record.type === "meta" && payload.kind === "compacted") {
      messages.push({
        role: "user",
        content: `[previous conversation summary]\n${String(payload.summary ?? "")}`,
      });
    } else if (record.type === "meta" && payload.kind === "checkpoint") {
      const checkpoint = payload.checkpoint as
        | { version?: number; summary?: string; recentMessages?: Message[] }
        | undefined;
      messages.push({
        role: "user",
        content: `[context checkpoint handoff]\n${String(checkpoint?.summary ?? "")}`,
      });
      if (checkpoint?.version === 1 && Array.isArray(checkpoint.recentMessages))
        messages.push(...checkpoint.recentMessages);
    } else if (record.type === "user") {
      messages.push({ role: "user", content: String(payload.content ?? "") });
    } else if (record.type === "assistant") {
      const toolCalls = payload.tool_calls as
        | { id: string; name: string; arguments: string }[]
        | undefined;
      messages.push({
        role: "assistant",
        content: String(payload.content ?? ""),
        ...(toolCalls ? { tool_calls: toolCalls } : {}),
      });
    } else if (record.type === "tool") {
      messages.push({
        role: "tool",
        tool_call_id: String(payload.tool_call_id ?? ""),
        content: String(payload.content ?? ""),
      });
    }
  }
  return messages;
}

function skillMessage(payload: Record<string, unknown>): Message {
  if (payload.format !== "skill-content-v1") {
    return {
      role: "system",
      content: [
        "<skill>",
        `<name>${String(payload.name ?? "")}</name>`,
        `<source>${String(payload.source ?? "user")}</source>`,
        "</skill>",
        "",
        String(payload.content ?? ""),
      ].join("\n"),
    };
  }
  return {
    role: "system",
    content: [
      `<skill_content name="${String(payload.name ?? "")}" source="${String(payload.source ?? "user")}">`,
      "Follow this explicitly activated skill before answering the user's task.",
      "",
      String(payload.content ?? "").trim(),
      "",
      "</skill_content>",
    ].join("\n"),
  };
}

export function serializeMessages(messages: Message[]): string {
  return messages
    .map((message) => `${message.role}: ${serializeContent(message.content)}`)
    .join("\n");
}

function serializeContent(content: Message["content"]): string {
  if (typeof content === "string") return content;
  return content
    .map((part) => (part.type === "text" ? part.text : "[image]"))
    .join("\n");
}
