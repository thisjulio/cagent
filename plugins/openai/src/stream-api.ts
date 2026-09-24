import type { OpenAI } from "openai";
import {
  toChatMessages,
  type LlmCallOptions,
  type LlmChunk,
} from "@cagent/sdk";

export async function* streamApi(
  client: OpenAI,
  request: LlmCallOptions,
): AsyncGenerator<LlmChunk> {
  const res = await client.chat.completions.create({
    model: request.model,
    messages: toChatMessages(request.messages) as any,
    tools: request.tools.length
      ? request.tools.map((t) => ({
          type: "function",
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          },
        }))
      : undefined,
    stream: true,
    stream_options: { include_usage: true },
  });
  let finish = "stop";
  let usage:
    | {
        input_tokens: number;
        output_tokens: number;
        cache_read_tokens?: number;
        cache_creation_tokens?: number;
      }
    | undefined;
  const toolCalls = new Map<
    number,
    { id: string; name: string; arguments: string }
  >();
  for await (const chunk of res) {
    const choice = chunk.choices[0];
    const delta = choice?.delta;
    if (delta?.content) yield { type: "text", text: delta.content };
    if (delta?.tool_calls) {
      for (const tc of delta.tool_calls) {
        const cur = toolCalls.get(tc.index) ?? {
          id: "",
          name: "",
          arguments: "",
        };
        if (tc.id) cur.id = tc.id;
        if (tc.function?.name) cur.name += tc.function.name;
        if (tc.function?.arguments) cur.arguments += tc.function.arguments;
        toolCalls.set(tc.index, cur);
      }
    }
    if (choice?.finish_reason) {
      finish = choice.finish_reason;
      for (const tc of toolCalls.values())
        yield { type: "tool-call", tool_call: tc };
      toolCalls.clear();
    }
    if (chunk.usage) {
      usage = {
        input_tokens: chunk.usage.prompt_tokens,
        output_tokens: chunk.usage.completion_tokens,
        cache_read_tokens:
          chunk.usage.prompt_tokens_details?.cached_tokens ?? 0,
      };
    }
  }
  yield { type: "finish", finish_reason: finish, usage };
}
