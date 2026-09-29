import {
  applyToolOverrides,
  noopObservability,
  overrideNameMap,
  trace,
  wrapToolParameters,
} from "@cagent/sdk";
import { lastUserMessage, workflowPayload } from "./loop-utils";
import { runToolCall } from "./tool-loop";
import {
  DEFAULT_MAX_INPUT_TOKENS_PER_TURN,
  budgetError,
  estimateMessageTokens,
} from "./loop-budget";
import type { TurnOpts, TurnRecord, TurnResult } from "./loop-types";
import type { StreamOpts } from "./loop-types";

export type {
  StreamOpts,
  TurnRecord,
  TurnOpts,
  TurnResult,
} from "./loop-types";

function countLeadingSystem(messages: { role: string }[]): number {
  const index = messages.findIndex((message) => message.role !== "system");
  return index < 0 ? messages.length : index;
}

function estimateToolTokens(
  tools: { name: string; description: string; parameters: unknown }[],
): number {
  if (!tools.length) return 0;
  const chars = tools.reduce(
    (total, tool) =>
      total +
      tool.name.length +
      tool.description.length +
      JSON.stringify(tool.parameters ?? {}).length,
    0,
  );
  return Math.ceil(chars / 4);
}

export function estimateRequestTokens(
  messages: Parameters<typeof estimateMessageTokens>[0],
  tools: { name: string; description: string; parameters: unknown }[] = [],
): number {
  return estimateMessageTokens(messages) + estimateToolTokens(tools);
}

export async function streamOnce(opts: StreamOpts): Promise<{
  text: string;
  toolCalls: { id: string; name: string; arguments: string; title?: string }[];
  inputTokens?: number;
}> {
  const attempts = opts.attempts ?? 3;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    let chunks = 0;
    try {
      const observability = opts.observability ?? noopObservability;
      const requestMessages = opts.messagesForRequest
        ? opts.messagesForRequest(opts.messages)
        : opts.messages;
      const effectiveStable =
        opts.stablePrefixMessages !== undefined
          ? Math.min(
              opts.stablePrefixMessages,
              countLeadingSystem(requestMessages),
            )
          : undefined;
      const request: any = await trace(
        observability,
        "provider.prepare_call",
        () =>
          opts.adapter.prepare_call({
            model: opts.model,
            variant: opts.variant,
            messages: requestMessages,
            tools: opts.tools,
            ...(effectiveStable !== undefined
              ? {
                  cache: {
                    stablePrefixMessages: effectiveStable,
                    ...(opts.cacheKey ? { key: opts.cacheKey } : {}),
                  },
                }
              : {}),
          }),
        { "provider.model": opts.model, ...opts.traceAttributes },
      );
      let text = "";
      let inputTokens: number | undefined;
      let outputChars = 0;
      let firstTokenAt: number | undefined;
      const streamStartedAt = performance.now();
      const toolCalls: {
        id: string;
        name: string;
        arguments: string;
        title?: string;
      }[] = [];
      const streamSpan = observability.startSpan("provider.stream", {
        "provider.model": opts.model,
        ...opts.traceAttributes,
      });
      opts.signal?.throwIfAborted();
      for await (const chunk of opts.adapter.stream(request, opts.signal)) {
        chunks++;
        firstTokenAt ??= performance.now();
        if (chunk.type === "finish") {
          inputTokens = chunk.usage?.input_tokens;
          opts.onUsage?.({
            inputTokens: chunk.usage?.input_tokens,
            outputTokens: chunk.usage?.output_tokens,
            cacheReadTokens: chunk.usage?.cache_read_tokens,
            cacheCreationTokens: chunk.usage?.cache_creation_tokens,
            timeToFirstTokenMs:
              chunk.usage?.time_to_first_token_ms ?? chunk.usage?.prompt_ms,
            tokensPerSecond:
              chunk.usage?.tokens_per_second ??
              (chunk.usage?.predicted_ms && chunk.usage?.predicted_n
                ? (chunk.usage.predicted_n / chunk.usage.predicted_ms) * 1000
                : undefined),
            promptTokensCached:
              chunk.usage?.prompt_tokens_cached ?? chunk.usage?.cache_n,
          });
        }
        if (opts.interrupted?.()) break;
        // Never cut a stream after a tool call has started: the provider
        // requires a matching tool output before accepting the next prompt.
        if (opts.shouldYield?.() && toolCalls.length === 0) break;
        if (chunk.type === "text") {
          text += chunk.text;
          outputChars += chunk.text.length;
          opts.onText?.(chunk.text);
          opts.onAssistantSnapshot?.(text);
        } else if (chunk.type === "reasoning") {
          opts.onReasoning?.(chunk.text);
        } else if (chunk.type === "tool-call") {
          toolCalls.push(chunk.tool_call);
        } else if (chunk.type === "tool-call-start") {
          opts.onToolCallStart?.(chunk.tool_call);
        }
      }
      streamSpan.setAttribute("provider.stream.chunks", chunks);
      streamSpan.setAttribute("provider.stream.output_chars", outputChars);
      if (firstTokenAt !== undefined)
        streamSpan.setAttribute(
          "provider.stream.time_to_first_chunk_ms",
          firstTokenAt - streamStartedAt,
        );
      streamSpan.end();
      return { text, toolCalls, inputTokens };
    } catch (e) {
      (opts.observability ?? noopObservability).recordEvent("provider.error", {
        "provider.model": opts.model,
      });
      lastErr = e;
      if (opts.signal?.aborted || chunks > 0 || i === attempts - 1) break;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
    }
  }
  throw lastErr;
}

async function checkRequestBudget(
  initial: Parameters<typeof estimateMessageTokens>[0],
  opts: TurnOpts & { messagesForRequest?: StreamOpts["messagesForRequest"] },
): Promise<Parameters<typeof estimateMessageTokens>[0]> {
  const limit = opts.maxInputTokensPerTurn ?? DEFAULT_MAX_INPUT_TOKENS_PER_TURN;
  const tools = (opts as StreamOpts).tools ?? [];
  const estimate =
    opts.adapter.estimate_tokens?.(opts.model, initial) ??
    estimateRequestTokens(initial, tools);
  if (estimate === undefined || estimate <= limit) return initial;
  await opts.compactIfNeeded?.().catch(() => {});
  const retryMessages = opts.messagesForRequest
    ? opts.messagesForRequest(opts.messages)
    : opts.messages;
  const retry =
    opts.adapter.estimate_tokens?.(opts.model, retryMessages) ??
    estimateRequestTokens(retryMessages, tools);
  if (retry !== undefined && retry > limit)
    throw budgetError("ERR_TURN_BUDGET", "turn input budget exceeded");
  return retryMessages;
}

// ponytail: a spent budget ends the turn with progress kept and a plain
// note, never with a throw that discards the turn and prints "error:".
function stopForBudget(
  opts: TurnOpts,
  records: TurnRecord[],
  kind: string,
  limit: number,
): void {
  const note = `Stopped after reaching the ${kind} budget (${limit}). Partial progress is kept — send a message to continue.`;
  opts.messages.push({ role: "assistant", content: note });
  records.push({ role: "assistant", content: note });
}

export async function runTurn(opts: TurnOpts): Promise<TurnResult> {
  const overrides = opts.adapter.tool_overrides?.() ?? {};
  const nameToCanonical = overrideNameMap(overrides);
  const streamOpts: StreamOpts = {
    ...opts,
    onToolCallStart: (toolCall) =>
      opts.onToolCallStart?.({
        ...toolCall,
        name: nameToCanonical[toolCall.name] ?? toolCall.name,
      }),
    tools: applyToolOverrides(opts.tools, overrides).map((tool) => ({
      ...tool,
      parameters: wrapToolParameters(tool.parameters),
    })),
  };
  const records: TurnRecord[] = [];
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  const ctx = {
    opts,
    nameToCanonical,
    records,
    evidence: [],
    changesWorkspace: false,
  };
  let turns = 0;
  let toolCalls = 0;
  let verificationFailures = 0;
  let verifiedChanges = false;
  let budgetExhausted = false;
  let verification: TurnResult["verification"];
  const observability = opts.observability ?? noopObservability;
  return trace(
    observability,
    "agent.turn",
    async () => {
      turnLoop: for (;;) {
        // ponytail: unbounded unless a cap was set explicitly — a turn
        // runs as many steps as the task needs.
        turns++;
        if (opts.maxTurns !== undefined && turns > opts.maxTurns) {
          await opts.compactIfNeeded?.().catch(() => {});
          stopForBudget(opts, records, "turns", opts.maxTurns);
          budgetExhausted = true;
          break;
        }
        await opts.compactIfNeeded?.();
        opts.bus.emit(
          "prompt.assembling",
          workflowPayload(opts, { query: lastUserMessage(opts.messages) }),
        );
        let requestMessages = streamOpts.messagesForRequest
          ? streamOpts.messagesForRequest(streamOpts.messages)
          : streamOpts.messages;
        requestMessages = await checkRequestBudget(requestMessages, {
          ...opts,
          messages: streamOpts.messages,
          messagesForRequest: streamOpts.messagesForRequest,
          tools: streamOpts.tools,
        });
        const result = await streamOnce({
          ...streamOpts,
          messages: requestMessages,
          messagesForRequest: undefined,
          onUsage: (usage) => {
            if (usage.inputTokens !== undefined)
              inputTokens = usage.inputTokens;
            if (usage.outputTokens !== undefined)
              outputTokens = usage.outputTokens;
            streamOpts.onUsage?.(usage);
          },
        });
        const { text, toolCalls: streamedToolCalls } = result;
        const assistant = {
          role: "assistant" as const,
          content: text,
          ...(streamedToolCalls.length
            ? { tool_calls: streamedToolCalls }
            : {}),
        };
        opts.messages.push(assistant);
        records.push({
          role: "assistant",
          content: text,
          tool_calls: streamedToolCalls.length ? streamedToolCalls : undefined,
        });
        if (
          !streamedToolCalls.length ||
          opts.interrupted?.() ||
          opts.shouldYield?.()
        ) {
          if (opts.verification && ctx.changesWorkspace && !verifiedChanges) {
            const result = await opts.verification.run();
            verification = result;
            if (result.passed) {
              verifiedChanges = true;
              break;
            }
            verificationFailures++;
            if (verificationFailures >= 2)
              throw new Error(
                `mandatory verification failed twice:\n${result.output}`,
              );
            const message = [
              "Mandatory verification failed. Do not report completion.",
              "Fix the errors, then stop so verification can run again.",
              result.output.slice(0, 4000),
            ].join("\n\n");
            opts.messages.push({ role: "user", content: message });
            records.push({ role: "assistant", content: message });
            continue;
          }
          if (opts.interrupted?.() || !(await opts.continueTurn?.())) break;
          continue;
        }
        for (const tc of streamedToolCalls) {
          toolCalls++;
          if (
            opts.maxToolCalls !== undefined &&
            toolCalls > opts.maxToolCalls
          ) {
            // ponytail: every streamed call needs an output before the next
            // request, so skipped calls get an error output instead of
            // aborting the turn mid-execution.
            for (const skipped of streamedToolCalls.slice(
              streamedToolCalls.indexOf(tc),
            )) {
              const output = "tool budget exceeded; call skipped";
              opts.messages.push({
                role: "tool",
                tool_call_id: skipped.id,
                content: output,
              });
              records.push({
                role: "tool",
                tool_call_id: skipped.id,
                content: output,
                toolName: skipped.name,
                isError: true,
              });
            }
            stopForBudget(opts, records, "tool calls", opts.maxToolCalls);
            budgetExhausted = true;
            break turnLoop;
          }
          await runToolCall(ctx, tc);
          opts.onToolCallFinished?.(tc.id);
          if (ctx.records.at(-1)?.changesWorkspace) {
            verifiedChanges = false;
            verificationFailures = 0;
          }
          if (opts.interrupted?.()) break;
        }
      }
      opts.bus.emit(
        "turn.completed",
        workflowPayload(opts, {
          content: [
            lastUserMessage(opts.messages),
            ...records
              .filter((record) => record.role === "assistant")
              .map((record) => record.content),
          ]
            .filter(Boolean)
            .join("\n"),
          toolContent: records
            .filter((record) => record.role === "tool" && !record.isError)
            .map((record) => record.content)
            .join("\n"),
          evidence: ctx.evidence,
        }),
      );
      return {
        records,
        interrupted: opts.interrupted?.() ?? false,
        budgetExhausted,
        inputTokens,
        outputTokens,
        verification,
      };
    },
    opts.traceAttributes,
  );
}
