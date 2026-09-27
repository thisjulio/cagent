import { toContentParts, type Message } from "@cagent/sdk";

type AnthropicBlock =
  | {
      type: "text";
      text: string;
      cache_control?: { type: "ephemeral" };
    }
  | {
      type: "image";
      source: { type: "base64"; media_type: string; data: string };
      cache_control?: { type: "ephemeral" };
    }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: unknown };

type AnthropicTextBlock = {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
};

function toImageBlock(
  url: string,
  mime: string | undefined,
): Extract<AnthropicBlock, { type: "image" }> {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(url);
  if (match)
    return {
      type: "image",
      source: { type: "base64", media_type: match[1], data: match[2] },
    };
  return {
    type: "image",
    source: { type: "base64", media_type: mime ?? "image/png", data: url },
  };
}

function toolResultContent(
  content: Message["content"],
): string | AnthropicBlock[] {
  if (typeof content === "string") return content;
  const blocks: AnthropicBlock[] = [];
  for (const part of toContentParts(content)) {
    if (part.type === "text") {
      if (part.text.length > 0) blocks.push({ type: "text", text: part.text });
    } else {
      blocks.push(toImageBlock(part.image_url.url, part.image_url.mime_type));
    }
  }
  return blocks;
}

function parseArguments(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export function buildRequest(
  messages: Message[],
  tools: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }[],
  stablePrefixMessages = 0,
): {
  system: AnthropicTextBlock[] | undefined;
  messages: { role: "user" | "assistant"; content: AnthropicBlock[] }[];
  tools:
    | {
        name: string;
        description: string;
        input_schema: unknown;
        cache_control?: { type: "ephemeral" };
      }[]
    | undefined;
} {
  const system: AnthropicTextBlock[] = [];
  const body: { role: "user" | "assistant"; content: AnthropicBlock[] }[] = [];

  let cacheBoundary: { kind: "system"; index: number } | undefined;
  let stableMessageBoundary: number | undefined;
  const firstNonSystem = messages.findIndex(
    (message) => message.role !== "system",
  );
  const maxPrefix = firstNonSystem < 0 ? messages.length : firstNonSystem;
  const effectivePrefix = Math.min(
    Math.max(0, stablePrefixMessages),
    maxPrefix,
  );
  for (const [messageIndex, message] of messages.entries()) {
    const inPrefix = messageIndex < effectivePrefix;
    if (message.role === "system") {
      const text =
        typeof message.content === "string"
          ? message.content
          : toContentParts(message.content)
              .filter((part) => part.type === "text")
              .map((part) => (part.type === "text" ? part.text : ""))
              .join("\n");
      if (text.trim()) {
        system.push({ type: "text", text });
        if (inPrefix) {
          cacheBoundary = { kind: "system", index: system.length - 1 };
          stableMessageBoundary = undefined;
        }
      }
      continue;
    }

    if (message.role === "tool") {
      const block: AnthropicBlock = {
        type: "tool_result",
        tool_use_id: message.tool_call_id ?? "",
        content: toolResultContent(message.content),
      };
      const last = body.at(-1);
      if (last?.role === "user") last.content.push(block);
      else body.push({ role: "user", content: [block] });
      // Tool results cannot carry an Anthropic cache breakpoint.
      continue;
    }

    const blocks: AnthropicBlock[] = [];
    for (const part of toContentParts(message.content)) {
      if (part.type === "text" && part.text.length > 0)
        blocks.push({ type: "text", text: part.text });
      else if (part.type === "image_url")
        blocks.push(toImageBlock(part.image_url.url, part.image_url.mime_type));
    }
    if (message.role === "assistant" && message.tool_calls?.length) {
      for (const call of message.tool_calls) {
        blocks.push({
          type: "tool_use",
          id: call.id,
          name: call.name,
          input: parseArguments(call.arguments),
        });
      }
    }
    if (blocks.length) {
      body.push({ role: message.role, content: blocks });
      if (inPrefix) {
        cacheBoundary = undefined;
        const cacheable = blocks.findLastIndex(
          (block) => block.type === "text" || block.type === "image",
        );
        if (cacheable >= 0) {
          const eligible = body[body.length - 1]?.content;
          if (
            eligible?.[cacheable]?.type === "text" ||
            eligible?.[cacheable]?.type === "image"
          )
            stableMessageBoundary = body.length - 1;
        }
      }
    }
  }

  const toolSchemas:
    | {
        name: string;
        description: string;
        input_schema: unknown;
        cache_control?: { type: "ephemeral" };
      }[]
    | undefined = tools.length
    ? tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.parameters,
      }))
    : undefined;

  if (toolSchemas?.length) {
    toolSchemas[toolSchemas.length - 1]!.cache_control = { type: "ephemeral" };
  } else if (cacheBoundary?.kind === "system") {
    system[cacheBoundary.index]!.cache_control = { type: "ephemeral" };
  } else if (stableMessageBoundary !== undefined) {
    const blocks = body[stableMessageBoundary]?.content;
    const lastCacheableBlock = blocks?.findLast(
      (block) => block.type === "text" || block.type === "image",
    );
    if (lastCacheableBlock)
      lastCacheableBlock.cache_control = { type: "ephemeral" };
  }

  return {
    system: system.length ? system : undefined,
    messages: body,
    tools: toolSchemas,
  };
}
