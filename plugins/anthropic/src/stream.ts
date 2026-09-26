import type Anthropic from "@anthropic-ai/sdk";
import {
  noopObservability,
  type LlmCallOptions,
  type LlmChunk,
  type Observability,
} from "@cagent/sdk";
import { billingAttribution } from "./attribution";
import { requestDiagnostics } from "./request-diagnostics";
import { buildRequest } from "./wire";

interface StreamOptions {
  max_tokens: number;
  beta?: string;
  metadata?: { user_id: string };
  observability?: Observability;
  signal?: AbortSignal;
}

function isEffortVariant(
  variant: string | undefined,
): variant is "low" | "medium" | "high" | "max" {
  return (
    variant === "low" ||
    variant === "medium" ||
    variant === "high" ||
    variant === "max"
  );
}

function supportsAdaptiveThinking(model: string): boolean {
  const canonical = model.toLowerCase();
  return /claude-(?:sonnet|opus)-[45]/.test(canonical);
}

function thinkingFor(
  model: string,
  variant: string | undefined,
): { type: "adaptive" } | undefined {
  if (!/claude-(?:sonnet|opus|haiku)-[45]/i.test(model)) return undefined;
  return isEffortVariant(variant) || supportsAdaptiveThinking(model)
    ? { type: "adaptive" }
    : undefined;
}

function effortFor(
  model: string,
  variant: string | undefined,
): "low" | "medium" | "high" | "max" | undefined {
  return supportsAdaptiveThinking(model) && isEffortVariant(variant)
    ? variant
    : undefined;
}

function errorDetails(error: unknown): {
  status?: number;
  code?: string;
  message: string;
  requestId?: string;
} {
  if (!error || typeof error !== "object") return { message: String(error) };
  const value = error as {
    status?: unknown;
    code?: unknown;
    message?: unknown;
    request_id?: unknown;
    requestID?: unknown;
    headers?: { get?: (name: string) => string | null };
  };
  const requestId =
    (typeof value.request_id === "string" && value.request_id) ||
    (typeof value.requestID === "string" && value.requestID) ||
    value.headers?.get?.("request-id") ||
    undefined;
  return {
    ...(typeof value.status === "number" ? { status: value.status } : {}),
    ...(typeof value.code === "string" ? { code: value.code } : {}),
    message:
      typeof value.message === "string"
        ? value.message.slice(0, 500)
        : "Unknown error",
    ...(requestId ? { requestId } : {}),
  };
}

function requestShape(
  request: LlmCallOptions,
  messages: { role: string; content: { type: string; text?: string }[] }[],
  tools: unknown[] | undefined,
  thinking: unknown,
  effort: unknown,
  authKind: string,
) {
  const lastMessage = messages.at(-1);
  return {
    "provider.name": "anthropic",
    "provider.model": request.model,
    "provider.variant": request.variant ?? "default",
    "anthropic.request.message_count": messages.length,
    "anthropic.request.assistant_final": lastMessage?.role === "assistant",
    "anthropic.request.assistant_prefix_candidate":
      lastMessage?.role === "assistant" &&
      lastMessage.content.every((block) => block.type === "text") &&
      lastMessage.content.some(
        (block) => block.type === "text" && !block.text?.trim(),
      ),
    "anthropic.request.tool_count": tools?.length ?? 0,
    ...requestDiagnostics(messages),
    "anthropic.request.has_thinking": Boolean(thinking),
    "anthropic.request.has_effort": Boolean(effort),
    "anthropic.request.auth_kind": authKind,
  };
}

function recordRequestError(
  observability: Observability,
  span: ReturnType<Observability["startSpan"]>,
  shape: ReturnType<typeof requestShape>,
  error: unknown,
): void {
  const details = errorDetails(error);
  span.setAttribute("error", true);
  if (details.status !== undefined)
    span.setAttribute("http.status_code", details.status);
  if (details.code) span.setAttribute("error.code", details.code);
  if (details.requestId)
    span.setAttribute("anthropic.request_id", details.requestId);
  span.setAttribute("error.message", details.message);
  span.recordException(error);
  span.end();
  observability.recordEvent("provider.anthropic.request.error", {
    ...shape,
    ...(details.status !== undefined
      ? { "http.status_code": details.status }
      : {}),
    ...(details.code ? { "error.code": details.code } : {}),
    ...(details.requestId ? { "anthropic.request_id": details.requestId } : {}),
    "error.message": details.message,
  });
}

// ponytail: tool-call chunks are buffered per content block index until its JSON is complete.
export async function* streamMessages(
  client: Anthropic,
  request: LlmCallOptions,
  options: StreamOptions,
): AsyncGenerator<LlmChunk> {
  const observability = options.observability ?? noopObservability;
  const { system, messages, tools } = buildRequest(
    request.messages,
    request.tools,
  );
  const requestSystem = [
    { type: "text" as const, text: billingAttribution(request.messages) },
    ...(system ? [{ type: "text" as const, text: system }] : []),
  ];
  const thinking = thinkingFor(request.model, request.variant);
  const effort = effortFor(request.model, request.variant);
  const shape = requestShape(
    request,
    messages,
    tools,
    thinking,
    effort,
    options.metadata ? "oauth" : "api",
  );
  const requestBody = {
    model: request.model,
    max_tokens: options.max_tokens,
    stream: true,
    messages,
    system: requestSystem,
    ...(thinking ? { thinking } : {}),
    ...(effort ? { output_config: { effort } } : {}),
    ...(tools ? { tools } : {}),
    ...(options.metadata ? { metadata: options.metadata } : {}),
  } as Anthropic.MessageCreateParamsStreaming;
  const span = observability.startSpan("provider.anthropic.request", shape);

  let stream: Awaited<ReturnType<typeof client.beta.messages.create>>;
  try {
    stream = await client.beta.messages.create(requestBody, {
      headers: options.beta ? { "anthropic-beta": options.beta } : undefined,
      signal: options.signal,
    });
  } catch (error) {
    recordRequestError(observability, span, shape, error);
    throw error;
  }

  let input_tokens = 0;
  let output_tokens = 0;
  let cache_read_tokens = 0;
  let cache_creation_tokens = 0;
  let finish_reason = "stop";
  const pending = new Map<
    number,
    { id: string; name: string; arguments: string }
  >();

  try {
    for await (const event of stream) {
      switch (event.type) {
        case "message_start": {
          const usage = event.message.usage ?? {};
          input_tokens = usage.input_tokens ?? 0;
          cache_read_tokens = usage.cache_read_input_tokens ?? 0;
          cache_creation_tokens = usage.cache_creation_input_tokens ?? 0;
          break;
        }
        case "content_block_start": {
          if (event.content_block.type === "tool_use") {
            pending.set(event.index, {
              id: event.content_block.id ?? `call_${event.index}`,
              name: event.content_block.name ?? "",
              arguments: "",
            });
          }
          break;
        }
        case "content_block_delta": {
          const delta = event.delta;
          if (delta.type === "text_delta")
            yield { type: "text", text: delta.text };
          if (delta.type === "thinking_delta")
            yield { type: "reasoning", text: delta.thinking };
          if (delta.type === "input_json_delta") {
            const current = pending.get(event.index);
            if (current) current.arguments += delta.partial_json;
          }
          break;
        }
        case "content_block_stop": {
          const call = pending.get(event.index);
          if (call) {
            pending.delete(event.index);
            yield { type: "tool-call", tool_call: call };
          }
          break;
        }
        case "message_delta": {
          if (event.delta.stop_reason) finish_reason = event.delta.stop_reason;
          output_tokens = event.usage.output_tokens ?? output_tokens;
          break;
        }
      }
    }
  } catch (error) {
    recordRequestError(observability, span, shape, error);
    throw error;
  }

  span.end();
  yield {
    type: "finish",
    finish_reason,
    usage: {
      input_tokens,
      output_tokens,
      cache_read_tokens,
      cache_creation_tokens,
    },
  };
}
