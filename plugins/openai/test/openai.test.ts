import { describe, expect, test } from "bun:test";
import type { OpenAI } from "openai";
import { createAdapter, fetchCodexModels } from "../src/index";

function fakeClient(): OpenAI {
  const chunks = [
    { choices: [{ delta: { content: "Hello" } }] },
    { choices: [{ delta: { content: " world" } }] },
    { choices: [{ delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 7, completion_tokens: 2 } },
  ];
  return {
    chat: {
      completions: {
        create: async () => ({
          [Symbol.asyncIterator]() {
            let i = 0;
            return {
              next: () =>
                i < chunks.length
                  ? { value: chunks[i++], done: false }
                  : { value: undefined, done: true },
            };
          },
        }),
      },
    },
    models: { list: async () => ({ data: [{ id: "gpt-5.4-mini" }] }) },
  } as unknown as OpenAI;
}

describe("openai adapter", () => {
  test("stream yields text chunks and finish with usage", async () => {
    const adapter = createAdapter({ config: {}, client: fakeClient() });
    const parts: string[] = [];
    let finish: { finish_reason: string; usage?: { input_tokens: number; output_tokens: number } } | undefined;
    for await (const chunk of adapter.stream({ model: "gpt-5.4-mini", messages: [{ role: "user", content: "hi" }], tools: [] })) {
      if (chunk.type === "text") parts.push(chunk.text);
      if (chunk.type === "finish") finish = chunk;
    }
    expect(parts.join("")).toBe("Hello world");
    expect(finish?.finish_reason).toBe("stop");
    expect(finish?.usage).toEqual({ input_tokens: 7, output_tokens: 2 });
  });

  test("list_models returns the API catalog", async () => {
    const adapter = createAdapter({ config: {}, client: fakeClient() });
    expect(await adapter.list_models()).toEqual(["gpt-5.4-mini"]);
  });

  test("fetchCodexModels hits the codex backend and returns slugs sorted", async () => {
    const orig = globalThis.fetch;
    try {
      globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = String(input);
        expect(url).toContain("/backend-api/codex/models?client_version=");
        return { ok: true, json: async () => ({ models: [{ slug: "gpt-5.5" }, { slug: "gpt-5.4" }, { id: "gpt-5.4-mini" }] }) };
      }) as unknown as typeof fetch;
      expect(await fetchCodexModels("tok", "acct")).toEqual(["gpt-5.4", "gpt-5.4-mini", "gpt-5.5"]);
    } finally {
      globalThis.fetch = orig;
    }
  });

  test("stream uses the codex responses endpoint for oauth auth", async () => {
    const sse =
      'event: response.output_text.delta\ndata: {"delta":"Hello"}\n\n' +
      'event: response.output_text.delta\ndata: {"delta":" world"}\n\n' +
      'event: response.completed\ndata: {"response":{"status":"completed","usage":{"input_tokens":3,"output_tokens":2}}}\n\n';
    const orig = globalThis.fetch;
    try {
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        expect(url).toContain("/backend-api/codex/responses");
        const parsed = JSON.parse(init?.body as string);
        expect(parsed.model).toBe("gpt-5.5");
        expect(parsed.stream).toBe(true);
        expect(parsed.store).toBe(false);
        return new Response(sse, { status: 200 });
      }) as unknown as typeof fetch;
      const adapter = createAdapter({ config: {}, auth: { kind: "oauth", access: "tok", account_id: "acct" } });
      const parts: string[] = [];
      let finish: { finish_reason: string; usage?: { input_tokens: number; output_tokens: number } } | undefined;
      for await (const chunk of adapter.stream({ model: "gpt-5.5", messages: [{ role: "user", content: "hi" }], tools: [] })) {
        if (chunk.type === "text") parts.push(chunk.text);
        if (chunk.type === "finish") finish = chunk;
      }
      expect(parts.join("")).toBe("Hello world");
      expect(finish?.usage).toEqual({ input_tokens: 3, output_tokens: 2 });
    } finally {
      globalThis.fetch = orig;
    }
  });

  test("prepare_call throws without a selected model", async () => {
    const adapter = createAdapter({ config: {}, client: fakeClient() });
    await expect(adapter.prepare_call({ model: "", messages: [], tools: [] })).rejects.toThrow("no model selected");
  });
});
