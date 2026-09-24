import { describe, expect, it, test } from "bun:test";
import { addAgentPrompt, LLAMA_AGENT_PROMPT } from "../src/agent-prompt";
import { createAdapter } from "../src/index";

function fakeModels(ids: string[]): typeof fetch {
  const orig = globalThis.fetch;
  const fake = (async (input: RequestInfo | URL) => {
    const url = String(input);
    expect(url).toContain("/v1/models");
    return {
      ok: true,
      json: async () => ({ data: ids.map((id) => ({ id })) }),
    };
  }) as unknown as typeof fetch;
  globalThis.fetch = fake;
  return orig;
}

describe("llama.cpp adapter", () => {
  it("estimates injected prompt and tool schema tokens", () => {
    const adapter = createAdapter();
    const messages = [{ role: "user" as const, content: "hello" }];
    const tools = [
      {
        name: "search",
        description: "Search the workspace",
        parameters: {
          type: "object",
          properties: { query: { type: "string" } },
        },
        execute: async () => ({ output: "" }),
      },
    ];
    const withoutTools = adapter.estimate_tokens?.("model", messages) ?? 0;
    const withTools = adapter.estimate_tokens?.("model", messages, tools) ?? 0;
    expect(withTools).toBeGreaterThan(withoutTools);
    expect(withoutTools).toBeGreaterThan(1);
  });

  test("replaces unrecoverable streamed tool arguments with valid JSON", async () => {
    const orig = globalThis.fetch;
    const event = {
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id: "call-1",
                function: {
                  name: "bash",
                  arguments:
                    '{"command":"export async function submitMessage(controller: Controller, text: string): Promise<void> {',
                },
              },
            ],
          },
        },
      ],
    };
    globalThis.fetch = (async () =>
      new Response(`data: ${JSON.stringify(event)}\n\n` + "data: [DONE]\n\n", {
        headers: { "Content-Type": "text/event-stream" },
      })) as typeof fetch;
    try {
      const adapter = createAdapter();
      const chunks = [];
      for await (const chunk of adapter.stream({
        model: "qwen",
        messages: [],
        tools: [],
      }))
        chunks.push(chunk);
      expect(chunks).toContainEqual({
        type: "tool-call",
        tool_call: { id: "call-1", name: "bash", arguments: "{}" },
      });
    } finally {
      globalThis.fetch = orig;
    }
  });
  test("adds the coding-agent prompt without replacing the existing system prompt", () => {
    const messages = addAgentPrompt([
      { role: "system", content: "Project rules" },
      { role: "user", content: "Inspect this" },
    ]);
    expect(messages[0].content).toContain("Project rules");
    expect(messages[0].content).toContain(
      "Use exact tool and argument names from the schema.",
    );
    expect(messages[1]).toEqual({ role: "user", content: "Inspect this" });
  });

  test("accepts nested context settings from older llama-server responses", async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = (async () => ({
      ok: true,
      json: async () => ({
        default_generation_settings: { params: { n_ctx: 80128 } },
      }),
    })) as unknown as typeof fetch;
    try {
      expect(await createAdapter().context_window?.("qwen")).toBe(80128);
    } finally {
      globalThis.fetch = orig;
    }
  });

  test("reports the runtime context window from llama-server", async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      expect(String(input)).toBe("http://localhost:8080/props");
      return {
        ok: true,
        json: async () => ({
          default_generation_settings: { params: { n_ctx: 80128 } },
        }),
      };
    }) as unknown as typeof fetch;
    try {
      expect(await createAdapter().context_window?.("qwen")).toBe(80128);
    } finally {
      globalThis.fetch = orig;
    }
  });

  test("uses the Codex-compatible patch schema for edit_file", () => {
    const override = createAdapter().tool_overrides?.().edit_file;
    expect(override?.name).toBe("edit_file");
    expect(override?.parameters?.required).toEqual(["patch"]);
    expect(override?.parameters?.properties).toHaveProperty("patch");
    expect(override?.parameters?.additionalProperties).toBe(false);
    expect(override?.description).toContain("*** Begin Patch");
    expect(override?.description).toContain("*** Update File:");
  });

  test("uses a strict JSON schema for write_file", () => {
    const adapter = createAdapter();
    const override = adapter.tool_overrides?.().write_file;
    expect(override).toBeDefined();
    expect(override?.name).toBe("write_file");
    expect(override?.parameters?.required).toEqual(["path", "content"]);
    expect(override?.parameters?.additionalProperties).toBe(false);
  });

  test("prepare_call injects the agent prompt by default and supports disabling it", async () => {
    const orig = fakeModels(["qwen.gguf"]);
    try {
      const adapter = createAdapter();
      await adapter.list_models();
      const prepared = await adapter.prepare_call({
        model: "qwen.gguf",
        messages: [{ role: "user", content: "hi" }],
        tools: [],
      });
      expect(prepared.messages[0]).toEqual({
        role: "system",
        content: `${LLAMA_AGENT_PROMPT}\n\n[reminder]\nCall one tool in this message, or give the final answer. Never both.`,
      });

      const disabled = createAdapter({ inject_agent_prompt: false });
      const withoutPrompt = await disabled.prepare_call({
        model: "qwen.gguf",
        messages: [{ role: "user", content: "hi" }],
        tools: [],
      });
      expect(withoutPrompt.messages).toEqual([{ role: "user", content: "hi" }]);
    } finally {
      globalThis.fetch = orig;
    }
  });

  test("list_models returns the model name, not the full path", async () => {
    const orig = fakeModels([
      "/home/user/models/llama-3.2-3b-instruct.Q8_0.gguf",
      "qwen2.5-7b-instruct-q4.gguf",
      "C:\\models\\mistral-7b.gguf",
    ]);
    try {
      const adapter = createAdapter();
      expect(await adapter.list_models()).toEqual([
        "llama-3.2-3b-instruct.Q8_0.gguf",
        "qwen2.5-7b-instruct-q4.gguf",
        "mistral-7b.gguf",
      ]);
    } finally {
      globalThis.fetch = orig;
    }
  });

  test("list_models deduplicates models that share a name", async () => {
    const orig = fakeModels([
      "/home/user/models/llama.gguf",
      "/home/user/models/alt/llama.gguf",
    ]);
    try {
      const adapter = createAdapter();
      expect(await adapter.list_models()).toEqual(["llama.gguf"]);
    } finally {
      globalThis.fetch = orig;
    }
  });

  test("prepare_call maps the model name back to the full id", async () => {
    const orig = fakeModels([
      "/home/user/models/llama-3.2-3b-instruct.Q8_0.gguf",
    ]);
    try {
      const adapter = createAdapter();
      await adapter.list_models();
      const prepared = await adapter.prepare_call({
        model: "llama-3.2-3b-instruct.Q8_0.gguf",
        messages: [{ role: "user", content: "hi" }],
        tools: [],
      });
      expect(prepared.model).toBe(
        "/home/user/models/llama-3.2-3b-instruct.Q8_0.gguf",
      );
    } finally {
      globalThis.fetch = orig;
    }
  });

  test("prepare_call keeps an unknown model unchanged", async () => {
    const orig = fakeModels(["/home/user/models/llama.gguf"]);
    try {
      const adapter = createAdapter();
      await adapter.list_models();
      const prepared = await adapter.prepare_call({
        model: "something-else",
        messages: [],
        tools: [],
      });
      expect(prepared.model).toBe("something-else");
    } finally {
      globalThis.fetch = orig;
    }
  });

  test("normalizes recoverable streamed tool arguments without inventing data", async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","function":{"name":"bash","arguments":"```json{\\"x\\":1,}```"}}]}}]}\n\n' +
          "data: [DONE]\n\n",
        { headers: { "Content-Type": "text/event-stream" } },
      )) as typeof fetch;
    try {
      const adapter = createAdapter();
      const chunks = [];
      for await (const chunk of adapter.stream({
        model: "qwen",
        messages: [],
        tools: [],
      }))
        chunks.push(chunk);
      expect(chunks).toContainEqual({
        type: "tool-call",
        tool_call: { id: "call-1", name: "bash", arguments: '{"x":1}' },
      });
    } finally {
      globalThis.fetch = orig;
    }
  });

  test("forwards llama-server prompt token usage on the finish chunk", async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        'data: {"choices":[{"delta":{"content":"done"},"finish_reason":"stop"}],"usage":{"prompt_tokens":2163,"completion_tokens":12}}\n\n' +
          "data: [DONE]\n\n",
        { headers: { "Content-Type": "text/event-stream" } },
      )) as typeof fetch;
    try {
      const adapter = createAdapter();
      const chunks = [];
      for await (const chunk of adapter.stream({
        model: "qwen",
        messages: [],
        tools: [],
      }))
        chunks.push(chunk);
      expect(chunks).toContainEqual({
        type: "finish",
        finish_reason: "stop",
        usage: { input_tokens: 2163, output_tokens: 12, cache_read_tokens: 0 },
      });
    } finally {
      globalThis.fetch = orig;
    }
  });

  test("forwards the reasoning variant as a chat template parameter", async () => {
    const orig = globalThis.fetch;
    let payload: Record<string, unknown> | undefined;
    globalThis.fetch = (async (
      _input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      payload = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(
        'data: {"choices":[{"delta":{"content":"done"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
        {
          headers: { "Content-Type": "text/event-stream" },
        },
      );
    }) as typeof fetch;
    try {
      const adapter = createAdapter();
      for await (const _chunk of adapter.stream({
        model: "qwen",
        messages: [],
        tools: [],
        variant: "ilow",
      })) {
      }
      expect(payload?.chat_template_kwargs).toEqual({
        reasoning_effort: "ilow",
      });
    } finally {
      globalThis.fetch = orig;
    }
  });
});
