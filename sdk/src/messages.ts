export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; mime_type?: string } };

export function toContentParts(content: string | ContentPart[]): ContentPart[] {
  if (typeof content === "string") return [{ type: "text", text: content }];
  return content;
}

export type Message = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ContentPart[];
  tool_calls?: { id: string; name: string; arguments: string }[];
  tool_call_id?: string;
};

export type WireMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | any[];
  tool_calls?: {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }[];
  tool_call_id?: string;
};

export function toChatMessages(messages: Message[]): WireMessage[] {
  return messages.map((message) => {
    const output: WireMessage = {
      role: message.role,
      content: message.content,
    };
    if (typeof message.content === "object") {
      output.content = message.content.map((part) => {
        if (part.type === "text") return { type: "text", text: part.text };
        return { type: "image_url", image_url: { url: part.image_url.url } };
      });
    }
    if (message.tool_call_id) output.tool_call_id = message.tool_call_id;
    if (message.tool_calls?.length) {
      output.tool_calls = message.tool_calls.map((toolCall) => ({
        id: toolCall.id,
        type: "function",
        function: {
          name: toolCall.name,
          arguments: toolCall.arguments,
        },
      }));
    }
    return output;
  });
}
