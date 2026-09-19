import {
  applyToolOverrides,
  noopObservability,
  overrideNameMap,
  trace,
} from "@cagent/sdk";
import { lastUserMessage, workflowPayload } from "./loop-utils";
import { runToolCall } from "./tool-loop";
import type { TurnOpts, TurnRecord, TurnResult } from "./loop-types";
import type { StreamOpts } from "./loop-types";

export type {
  StreamOpts,
  TurnRecord,
  TurnOpts,
  TurnResult,
} from "./loop-types";

export async function streamOnce(opts: StreamOpts): Promise<{
  text: string;
  toolCalls: { id: string; name: string; arguments: string }[];
  inputTokens?: number;
}> {
  const attempts = opts.attempts ?? 3;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const observability = opts.observability ?? noopObservability;
      const request: any = await trace(
        observability,
        "provider.prepare_call",
        () =>
          opts.adapter.prepare_call({
            model: opts.model,
            variant: opts.variant,
            messages: opts.messagesForRequest
              ? opts.messagesForRequest(opts.messages)
              : opts.messages,
            tools: opts.tools,
          }),
        { "provider.model": opts.model, ...opts.traceAttributes },
      );
      let text = "";
      let inputTokens: number | undefined;
      let chunks = 0;
      let outputChars = 0;
      let firstTokenAt: number | undefined;
      const streamStartedAt = performance.now();
      const toolCalls: { id: string; name: string; arguments: string }[] = [];
      const streamSpan = observability.startSpan("provider.stream", {
        "provider.model": opts.model,
        ...opts.traceAttributes,
      });
      for await (const chunk of opts.adapter.stream(request)) {
        chunks++;
        firstTokenAt ??= performance.now();
        if (chunk.type === "finish") {
          inputTokens = chunk.usage?.input_tokens;
          opts.onUsage?.({
            inputTokens: chunk.usage?.input_tokens,
            outputTokens: chunk.usage?.output_tokens,
          });
        }
        if (opts.interrupted?.()) break;
        if (chunk.type === "text") {
          text += chunk.text;
          outputChars += chunk.text.length;
          opts.onText?.(chunk.text);
        } else if (chunk.type === "reasoning") {
          opts.onReasoning?.(chunk.text);
        } else if (chunk.type === "tool-call") {
          toolCalls.push(chunk.tool_call);
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
      if (i < attempts - 1)
        await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
    }
  }
  throw lastErr;
}

export async function runTurn(opts: TurnOpts): Promise<TurnResult> {
  const overrides = opts.adapter.tool_overrides?.() ?? {};
  const nameToCanonical = overrideNameMap(overrides);
  const streamOpts: StreamOpts = {
    ...opts,
    tools: applyToolOverrides(opts.tools, overrides),
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
  let verification: TurnResult["verification"];
  const observability = opts.observability ?? noopObservability;
  return trace(
    observability,
    "agent.turn",
    async () => {
      for (;;) {
        if (++turns > (opts.maxTurns ?? Infinity))
          throw new Error("maximum turns exceeded");
        opts.bus.emit(
          "prompt.assembling",
          workflowPayload(opts, { query: lastUserMessage(opts.messages) }),
        );
        const result = await streamOnce({
          ...streamOpts,
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
        if (!streamedToolCalls.length || opts.interrupted?.()) {
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
              result.output,
            ].join("\n\n");
            opts.messages.push({ role: "user", content: message });
            records.push({ role: "assistant", content: message });
            continue;
          }
          break;
        }
        for (const tc of streamedToolCalls) {
          if (++toolCalls > (opts.maxToolCalls ?? Infinity))
            throw new Error("maximum tool calls exceeded");
          await runToolCall(ctx, tc);
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
        inputTokens,
        outputTokens,
        verification,
      };
    },
    opts.traceAttributes,
  );
}
