import { toChatMessages, type LlmCallOptions, type LlmChunk, type Plugin, type ProviderAdapter } from "@cagent/sdk";

interface Config {
  url?: string;
  api_key?: string;
  timeout_ms?: number;
}

function baseUrl(config: Config): string {
  return String(config.url ?? "http://localhost:8080").replace(/\/$/, "");
}

function headers(config: Config): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...(config.api_key ? { Authorization: `Bearer ${config.api_key}` } : {}),
  };
}

async function checkedJson(response: Response): Promise<Record<string, unknown>> {
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`llama-server respondeu ${response.status}: ${body.slice(0, 500)}`);
  }
  return (await response.json()) as Record<string, unknown>;
}

function toolPayload(request: LlmCallOptions): unknown[] | undefined {
  if (!request.tools.length) return undefined;
  return request.tools.map((tool) => ({
    type: "function",
    function: { name: tool.name, description: tool.description, parameters: tool.parameters },
  }));
}

async function* streamChatCompletions(request: LlmCallOptions, config: Config): AsyncGenerator<LlmChunk> {
  const root = baseUrl(config);
  const fetchOptions = config.timeout_ms ? { signal: AbortSignal.timeout(config.timeout_ms) } : {};
  const tools = toolPayload(request);
  const body = {
    model: request.model,
    messages: toChatMessages(request.messages),
    stream: true,
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
    throw new Error(`llama-server respondeu ${response.status}: ${error.slice(0, 500)}`);
  }
  if (!response.body) throw new Error("llama-server did not return a stream");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const calls = new Map<number, { id: string; name: string; arguments: string }>();
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
      if (typeof delta.content === "string") yield { type: "text", text: delta.content };
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
        const current = calls.get(index) ?? { id: call.id ?? `call_${index}`, name: "", arguments: "" };
        if (call.id) current.id = call.id;
        if (call.function?.name) current.name += call.function.name;
        if (call.function?.arguments) current.arguments += call.function.arguments;
        calls.set(index, current);
      }
      if (choice?.finish_reason) yield { type: "finish", finish_reason: String(choice.finish_reason) };
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
    yield { type: "tool-call", tool_call: { ...call, arguments: call.arguments || "{}" } };
  }
}

export function createAdapter(config: Config = {}): ProviderAdapter {
  return {
    async list_models(): Promise<string[]> {
      const response = await fetch(`${baseUrl(config)}/v1/models`, {
        headers: headers(config),
        ...(config.timeout_ms ? { signal: AbortSignal.timeout(config.timeout_ms) } : {}),
      });
      const json = await checkedJson(response);
      const data = Array.isArray(json.data) ? json.data : [];
      return data
        .map((item) => (item && typeof item === "object" ? (item as { id?: unknown }).id : undefined))
        .filter((id): id is string => typeof id === "string");
    },

    async prepare_call(options: LlmCallOptions): Promise<LlmCallOptions> {
      return options;
    },

    async *stream(request: LlmCallOptions): AsyncGenerator<LlmChunk> {
      yield* streamChatCompletions(request, config);
    },
  };
}

const register: Plugin = (ctx) => {
  ctx.registerProvider("llama.cpp", createAdapter(ctx.config as Config));
};

export default register;
