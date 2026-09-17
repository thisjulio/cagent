import type { LlmCallOptions } from "@cagent/sdk";

export interface LlamaConfig {
  url?: string;
  api_key?: string;
  timeout_ms?: number;
  agent_prompt?: string;
  inject_agent_prompt?: boolean;
}

export function baseUrl(config: LlamaConfig): string { return String(config.url ?? "http://localhost:8080").replace(/\/$/, ""); }

export function headers(config: LlamaConfig): Record<string, string> {
  return { "Content-Type": "application/json", ...(config.api_key ? { Authorization: `Bearer ${config.api_key}` } : {}) };
}

export async function checkedJson(response: Response): Promise<Record<string, unknown>> {
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`llama-server respondeu ${response.status}: ${body.slice(0, 500)}`);
  }
  return (await response.json()) as Record<string, unknown>;
}

export function contextSize(json: Record<string, unknown>): number | undefined {
  const settings = json.default_generation_settings;
  if (!settings || typeof settings !== "object") return undefined;
  const direct = (settings as { n_ctx?: unknown }).n_ctx;
  const params = (settings as { params?: unknown }).params;
  const nested = params && typeof params === "object" ? (params as { n_ctx?: unknown }).n_ctx : undefined;
  const value = direct ?? nested;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

export function toolPayload(request: LlmCallOptions): unknown[] | undefined {
  if (!request.tools.length) return undefined;
  return request.tools.map((tool) => ({ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.parameters } }));
}

export function modelKey(id: string): string {
  const cut = Math.max(id.lastIndexOf("/"), id.lastIndexOf("\\"));
  return cut === -1 ? id : id.slice(cut + 1);
}

export function validToolArguments(argumentsText: string): string {
  const plain = argumentsText.trim().replace(/^```(?:json)?\s*|\s*```$/gi, "").trim();
  const candidates = [argumentsText.trim(), plain, plain.replace(/,\s*([}\]])/g, "$1")];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try { JSON.parse(candidate); return candidate; } catch { /* Try the next low-risk normalization. */ }
  }
  // Never resend malformed arguments: llama-server parses assistant tool calls
  // as JSON before it can return a useful tool error.
  return "{}";
}
