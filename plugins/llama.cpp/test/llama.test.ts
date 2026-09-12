import { describe, expect, test } from "bun:test";
import { addAgentPrompt, LLAMA_AGENT_PROMPT } from "../src/agent-prompt";
import { createAdapter } from "../src/index";

function fakeModels(ids: string[]): typeof fetch {
  const orig = globalThis.fetch;
  const fake = (async (input: RequestInfo | URL) => {
    const url = String(input);
    expect(url).toContain("/v1/models");
    return { ok: true, json: async () => ({ data: ids.map((id) => ({ id })) }) };
  }) as unknown as typeof fetch;
  globalThis.fetch = fake;
  return orig;
}

describe("llama.cpp adapter", () => {
  test("adds the coding-agent prompt without replacing the existing system prompt", () => {
    const messages = addAgentPrompt([
      { role: "system", content: "Project rules" },
      { role: "user", content: "Inspect this" },
    ]);
    expect(messages[0].content).toContain("Project rules");
    expect(messages[0].content).toContain("Follow the available tool schemas exactly");
    expect(messages[1]).toEqual({ role: "user", content: "Inspect this" });
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
      expect(prepared.messages[0]).toEqual({ role: "system", content: LLAMA_AGENT_PROMPT });

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
    const orig = fakeModels(["/home/user/models/llama.gguf", "/home/user/models/alt/llama.gguf"]);
    try {
      const adapter = createAdapter();
      expect(await adapter.list_models()).toEqual(["llama.gguf"]);
    } finally {
      globalThis.fetch = orig;
    }
  });

  test("prepare_call maps the model name back to the full id", async () => {
    const orig = fakeModels(["/home/user/models/llama-3.2-3b-instruct.Q8_0.gguf"]);
    try {
      const adapter = createAdapter();
      await adapter.list_models();
      const prepared = await adapter.prepare_call({
        model: "llama-3.2-3b-instruct.Q8_0.gguf",
        messages: [{ role: "user", content: "hi" }],
        tools: [],
      });
      expect(prepared.model).toBe("/home/user/models/llama-3.2-3b-instruct.Q8_0.gguf");
    } finally {
      globalThis.fetch = orig;
    }
  });

  test("prepare_call keeps an unknown model unchanged", async () => {
    const orig = fakeModels(["/home/user/models/llama.gguf"]);
    try {
      const adapter = createAdapter();
      await adapter.list_models();
      const prepared = await adapter.prepare_call({ model: "something-else", messages: [], tools: [] });
      expect(prepared.model).toBe("something-else");
    } finally {
      globalThis.fetch = orig;
    }
  });
});
