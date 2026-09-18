import type { LlmCallOptions, LlmChunk } from "@cagent/sdk";
import { extractResidency, toInputItems } from "./codex";
import { APPLY_PATCH_GRAMMAR } from "./apply-patch-grammar";

const CODEX_RESPONSES_URL = "https://chatgpt.com/backend-api/codex/responses";

export async function* streamCodex(
  request: LlmCallOptions,
  access: string,
  accountId?: string,
): AsyncGenerator<LlmChunk> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${access}`,
    "content-type": "application/json",
  };
  if (accountId) headers["ChatGPT-Account-Id"] = accountId;
  const residency = extractResidency(access);
  if (residency) headers["x-openai-internal-codex-residency"] = residency;

  const systemMsg = request.messages.find((m) => m.role === "system");
  const res = await fetch(CODEX_RESPONSES_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: request.model,
      instructions: systemMsg?.content ?? "",
      input: toInputItems(request.messages.filter((m) => m.role !== "system")),
      tool_choice: "auto",
      stream: true,
      store: false,
      reasoning: { effort: request.variant ?? "low", summary: "detailed" },
      ...(request.tools.length
        ? {
            tools: request.tools.map((t) =>
              t.name === "apply_patch"
                ? {
                    type: "custom",
                    name: t.name,
                    description: t.description,
                    format: {
                      type: "grammar",
                      syntax: "lark",
                      definition: APPLY_PATCH_GRAMMAR,
                    },
                  }
                : {
                    type: "function",
                    name: t.name,
                    description: t.description,
                    parameters: t.parameters,
                    strict: false,
                  },
            ),
          }
        : {}),
    }),
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`stream failed: ${res.status} ${text}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let finish = "stop";
  let usage: { input_tokens: number; output_tokens: number } | undefined;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx = buf.indexOf("\n\n");
    while (idx !== -1) {
      const block = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const event = block
        .split("\n")
        .find((l) => l.startsWith("event:"))
        ?.slice(7)
        .trim();
      const dataLine = block.split("\n").find((l) => l.startsWith("data:"));
      if (event && dataLine) {
        let data: Record<string, unknown>;
        try {
          data = JSON.parse(dataLine.slice(5).trim());
        } catch {
          continue;
        }
        if (event === "response.output_text.delta") {
          yield { type: "text", text: String(data.delta ?? "") };
        } else if (
          event === "response.reasoning_summary_part" ||
          event === "response.reasoning_summary_text.delta" ||
          event === "response.reasoning_summary.delta"
        ) {
          const text = data.delta ?? data.text ?? data.part;
          if (typeof text === "string" && text)
            yield { type: "reasoning", text };
        } else if (event === "response.output_item.done") {
          const item = data.item as Record<string, unknown> | undefined;
          if (
            item &&
            (item.type === "function_call" || item.type === "custom_tool_call")
          ) {
            yield {
              type: "tool-call",
              tool_call: {
                id: String(item.call_id ?? item.id ?? ""),
                name: String(item.name ?? ""),
                arguments: String(item.arguments ?? item.input ?? ""),
              },
            };
          }
        } else if (event === "response.completed") {
          const r = data.response as Record<string, unknown> | undefined;
          const u = r?.usage as
            | { input_tokens?: number; output_tokens?: number }
            | undefined;
          if (u)
            usage = {
              input_tokens: u.input_tokens ?? 0,
              output_tokens: u.output_tokens ?? 0,
            };
          finish = String(r?.status ?? "stop");
        }
      }
      idx = buf.indexOf("\n\n");
    }
  }
  yield { type: "finish", finish_reason: finish, usage };
}
