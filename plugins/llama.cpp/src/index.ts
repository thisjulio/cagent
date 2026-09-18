import {
  toChatMessages,
  type LlmCallOptions,
  type LlmChunk,
  type Plugin,
  type ProviderAdapter,
  type ToolDefinition,
} from "@cagent/sdk";
import { addAgentPrompt } from "./agent-prompt";
import {
  baseUrl,
  checkedJson,
  contextSize,
  headers,
  modelKey,
  toolPayload,
  validToolArguments,
  type LlamaConfig,
} from "./protocol";
import { LLAMA_TOOL_OVERRIDES } from "./tools";

async function* streamChatCompletions(
  request: LlmCallOptions,
  config: LlamaConfig,
): AsyncGenerator<LlmChunk> {
  const root = baseUrl(config);
  const fetchOptions = config.timeout_ms
    ? { signal: AbortSignal.timeout(config.timeout_ms) }
    : {};
  const tools = toolPayload(request);
  const body = {
    model: request.model,
    messages: toChatMessages(request.messages),
    stream: true,
    stream_options: { include_usage: true },
    ...(request.variant
      ? { chat_template_kwargs: { reasoning_effort: request.variant } }
      : {}),
    ...(tools ? { tools } : {}),
  };
  const response = await fetch(`${root}/v1/chat/completions`, {
    method: "POST",
    headers: headers(config),
    body: JSON.stringify(body),
    ...fetchOptions,
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(
      `llama-server respondeu ${response.status}: ${error.slice(0, 500)}`,
    );
  }
  if (!response.body) throw new Error("llama-server did not return a stream");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const calls = new Map<
    number,
    { id: string; name: string; arguments: string }
  >();
  const consume = async function* (text: string): AsyncGenerator<LlmChunk> {
    for (const block of text.split(/\n\n/)) {
      const line = block.split("\n").find((item) => item.startsWith("data:"));
      if (!line) continue;
      const value = line.slice(5).trim();
      if (value === "[DONE]") continue;
      let json: any;
      try {
        json = JSON.parse(value);
      } catch {
        continue;
      }
      const choice = json.choices?.[0];
      const delta = choice?.delta ?? {};
      if (typeof delta.content === "string")
        yield { type: "text", text: delta.content };
      // ponytail: field varies by llama-server version (reasoning_content | reasoning).
      const reasoning =
        typeof delta.reasoning_content === "string"
          ? delta.reasoning_content
          : typeof delta.reasoning === "string"
            ? delta.reasoning
            : undefined;
      if (reasoning !== undefined) yield { type: "reasoning", text: reasoning };
      for (const call of delta.tool_calls ?? []) {
        const index = Number(call.index ?? 0);
        const current = calls.get(index) ?? {
          id: call.id ?? `call_${index}`,
          name: "",
          arguments: "",
        };
        if (call.id) current.id = call.id;
        if (call.function?.name) current.name += call.function.name;
        if (call.function?.arguments)
          current.arguments += call.function.arguments;
        calls.set(index, current);
      }
      const usage = json.usage;
      const inputTokens =
        typeof usage?.prompt_tokens === "number"
          ? usage.prompt_tokens
          : typeof usage?.input_tokens === "number"
            ? usage.input_tokens
            : undefined;
      const outputTokens =
        typeof usage?.completion_tokens === "number"
          ? usage.completion_tokens
          : typeof usage?.output_tokens === "number"
            ? usage.output_tokens
            : undefined;
      if (choice?.finish_reason || inputTokens !== undefined) {
        yield {
          type: "finish",
          finish_reason: String(choice?.finish_reason ?? "stop"),
          ...(inputTokens !== undefined && outputTokens !== undefined
            ? {
                usage: {
                  input_tokens: inputTokens,
                  output_tokens: outputTokens,
                },
              }
            : {}),
        };
      }
    }
  };
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    buffer += decoder.decode(part.value, { stream: true });
    const blocks = buffer.split(/\n\n/);
    buffer = blocks.pop() ?? "";
    for await (const chunk of consume(blocks.join("\n\n"))) yield chunk;
  }
  buffer += decoder.decode();
  for await (const chunk of consume(buffer)) yield chunk;
  for (const call of calls.values()) {
    yield {
      type: "tool-call",
      tool_call: {
        ...call,
        arguments: validToolArguments(call.arguments || "{}"),
      },
    };
  }
}

export function createAdapter(config: LlamaConfig = {}): ProviderAdapter {
  // ponytail: llama-server lists models by full path, but the picker wants only the name.
  // prepare_call maps the name back to the full id because the server rejects anything else.
  const modelIds = new Map<string, string>();

  return {
    estimate_tokens(_model: string, messages, tools: ToolDefinition[] = []) {
      const prepared =
        config.inject_agent_prompt === false
          ? messages
          : addAgentPrompt(messages, config.agent_prompt);
      const content = prepared.reduce(
        (total, message) =>
          total +
          message.content.length +
          (message.tool_calls ? JSON.stringify(message.tool_calls).length : 0),
        0,
      );
      const toolSchema = tools.length
        ? JSON.stringify(
            tools.map(
              (tool) =>
                toolPayload({ model: "", messages: [], tools: [tool] })?.[0],
            ),
          ).length
        : 0;
      return Math.ceil((content + toolSchema) / 4);
    },
    tool_overrides: () => LLAMA_TOOL_OVERRIDES,
    async context_window(): Promise<number | undefined> {
      const response = await fetch(`${baseUrl(config)}/props`, {
        headers: headers(config),
        ...(config.timeout_ms
          ? { signal: AbortSignal.timeout(config.timeout_ms) }
          : {}),
      });
      return contextSize(await checkedJson(response));
    },
    async list_models(): Promise<string[]> {
      const response = await fetch(`${baseUrl(config)}/v1/models`, {
        headers: headers(config),
        ...(config.timeout_ms
          ? { signal: AbortSignal.timeout(config.timeout_ms) }
          : {}),
      });
      const json = await checkedJson(response);
      const data = Array.isArray(json.data) ? json.data : [];
      const ids = data
        .map((item) =>
          item && typeof item === "object"
            ? (item as { id?: unknown }).id
            : undefined,
        )
        .filter((id): id is string => typeof id === "string");
      const keys: string[] = [];
      for (const id of ids) {
        const key = modelKey(id);
        modelIds.set(key, id);
        if (!keys.includes(key)) keys.push(key);
      }
      return keys;
    },

    async prepare_call(options: LlmCallOptions): Promise<LlmCallOptions> {
      const messages =
        config.inject_agent_prompt === false
          ? options.messages
          : addAgentPrompt(options.messages, config.agent_prompt);
      return {
        ...options,
        model: modelIds.get(options.model) ?? options.model,
        messages,
      };
    },

    async *stream(request: LlmCallOptions): AsyncGenerator<LlmChunk> {
      yield* streamChatCompletions(request, config);
    },
  };
}

const register: Plugin = (ctx) => {
  ctx.registerProvider("llama.cpp", createAdapter(ctx.config as LlamaConfig));
};

export default register;
