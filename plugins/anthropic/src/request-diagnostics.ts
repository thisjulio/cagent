import type { Message } from "@cagent/sdk";

type WireMessage = {
  role: "user" | "assistant" | string;
  content: {
    type: string;
    id?: string;
    tool_use_id?: string;
    text?: string;
  }[];
};

export function requestDiagnostics(messages: WireMessage[]) {
  const toolUses = new Set<string>();
  const toolResults = new Set<string>();
  const messageShape = messages.map((message, index) => {
    const blockTypes: string[] = [];
    let textChars = 0;
    for (const block of message.content) {
      blockTypes.push(block.type);
      if (block.type === "text") textChars += block.text?.length ?? 0;
      if (block.type === "tool_use" && block.id) toolUses.add(block.id);
      if (block.type === "tool_result" && block.tool_use_id)
        toolResults.add(block.tool_use_id);
    }
    return {
      index,
      role: message.role,
      block_types: blockTypes.join(","),
      block_count: blockTypes.length,
      text_chars: textChars,
    };
  });
  const orphanResults = [...toolResults].filter(
    (id) => !toolUses.has(id),
  ).length;
  const missingResults = [...toolUses].filter(
    (id) => !toolResults.has(id),
  ).length;
  const roleSequence = messages.map((message) => message.role).join(",");
  const adjacentSameRole = messages.reduce(
    (count, message, index) =>
      count + (index > 0 && messages[index - 1]?.role === message.role ? 1 : 0),
    0,
  );
  const consecutiveUserMessages = messages.reduce(
    (count, message, index) =>
      count +
      (message.role === "user" && messages[index - 1]?.role === "user" ? 1 : 0),
    0,
  );

  return {
    "anthropic.request.role_sequence": roleSequence,
    "anthropic.request.message_shape": JSON.stringify(messageShape),
    "anthropic.request.adjacent_same_role_count": adjacentSameRole,
    "anthropic.request.tool_use_count": toolUses.size,
    "anthropic.request.tool_result_count": toolResults.size,
    "anthropic.request.orphan_tool_result_count": orphanResults,
    "anthropic.request.tool_use_without_result_count": missingResults,
    "anthropic.request.has_tool_pairing_issue":
      orphanResults > 0 || missingResults > 0,
    "anthropic.request.consecutive_user_count": consecutiveUserMessages,
  };
}

export function inputMessageShape(messages: Message[]) {
  return messages.map((message, index) => ({
    index,
    role: message.role,
    has_tool_calls: Boolean(message.tool_calls?.length),
    has_tool_call_id: Boolean(message.tool_call_id),
    content_kind: typeof message.content === "string" ? "text" : "parts",
    content_part_types:
      typeof message.content === "string"
        ? "text"
        : message.content.map((part) => part.type).join(","),
  }));
}
