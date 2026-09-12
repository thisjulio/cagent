import type { LlmCallOptions } from "@cagent/sdk";

// The ChatGPT token's model catalog comes from the Codex backend, not public /v1/models.
export async function fetchCodexModels(access: string, accountId?: string): Promise<string[]> {
  const res = await fetch("https://chatgpt.com/backend-api/codex/models?client_version=1.0.0", {
    headers: {
      authorization: `Bearer ${access}`,
      ...(accountId ? { "ChatGPT-Account-Id": accountId } : {}),
    },
  });
  if (!res.ok) throw new Error(`model listing failed: ${res.status}`);
  const data = (await res.json()) as { models: { id?: string; slug?: string }[] };
  return data.models.map((m) => m.id ?? m.slug).filter((s) => s).sort();
}

function jwtClaims(token: string): Record<string, unknown> | undefined {
  const parts = token.split(".");
  if (parts.length !== 3) return undefined;
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString()) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

export function extractResidency(token: string): string | undefined {
  const claims = jwtClaims(token);
  const r =
    (claims?.["https://api.openai.com/auth"] as Record<string, unknown> | undefined)?.chatgpt_compute_residency ??
    (claims?.chatgpt_compute_residency as string | undefined);
  return r && r !== "no_constraint" ? r : undefined;
}

export function toInputItems(messages: LlmCallOptions["messages"]): unknown[] {
  const items: unknown[] = [];
  for (const m of messages) {
    if (m.role === "assistant") {
      if (m.content) items.push({ type: "message", role: m.role, content: [{ type: "output_text", text: m.content }] });
      for (const tc of m.tool_calls ?? []) {
        items.push({ type: "function_call", name: tc.name, arguments: tc.arguments, call_id: tc.id });
      }
    } else if (m.role === "tool") {
      items.push({
        type: "function_call_output",
        call_id: m.tool_call_id ?? "",
        output: m.content ?? "",
      });
    } else {
      items.push({ type: "message", role: m.role, content: [{ type: "input_text", text: m.content ?? "" }] });
    }
  }
  return items;
}
