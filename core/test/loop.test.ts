import { describe, expect, it } from "bun:test";
import { defineTool, type LlmCallOptions, type LlmChunk, type Message, type ProviderAdapter } from "@cagent/sdk";
import { EventBus } from "../src/events";
import { runTurn, streamOnce } from "../src/loop";

function fakeAdapter(script: LlmChunk[][], failFirst = 0): ProviderAdapter {
  let calls = 0;
  return {
    async list_models() {
      return ["m"];
    },
    async prepare_call(o: LlmCallOptions) {
      return o;
    },
    async *stream() {
      calls++;
      if (calls <= failFirst) throw new Error("boom");
      for (const c of script[calls - 1 - failFirst] ?? []) yield c;
    },
  };
}

describe("loop de agente", () => {
  const tool = defineTool("bash", "exec", {}, async () => ({ output: "resultado" }));
  const bus = new EventBus();

  it("multi-turno com tool call", async () => {
    const messages: Message[] = [{ role: "system", content: "s" }, { role: "user", content: "rode ls" }];
    const r = await runTurn({
      adapter: fakeAdapter([
        [
          { type: "text", text: "rodando" },
          { type: "tool-call", tool_call: { id: "t1", name: "bash", arguments: '{"command":"ls"}' } },
          { type: "finish", finish_reason: "stop" },
        ],
        [{ type: "text", text: "feito" }, { type: "finish", finish_reason: "stop" }],
      ]),
      model: "m",
      messages,
      tools: [tool],
      allowlist: ["ls"],
      ask: async () => false,
      bus,
    });
    expect(r.records).toHaveLength(3);
    expect(messages[messages.length - 3].role).toBe("assistant");
    expect(messages[messages.length - 3].tool_calls).toEqual([{ id: "t1", name: "bash", arguments: '{"command":"ls"}' }]);
    expect(messages[messages.length - 2].role).toBe("tool");
    expect(messages[messages.length - 2].content).toBe("resultado");
    expect(messages[messages.length - 1].role).toBe("assistant");
  });

  it("streamOnce passa reasoning ao callback", async () => {
    const seen: string[] = [];
    const r = await streamOnce({
      adapter: fakeAdapter([[{ type: "reasoning", text: "r1" }, { type: "text", text: "ok" }, { type: "finish", finish_reason: "stop" }]]),
      model: "m",
      messages: [],
      tools: [],
      onReasoning: (t) => seen.push(t),
    });
    expect(r.text).toBe("ok");
    expect(seen).toEqual(["r1"]);
  });

  it("retry com backoff até sucesso", async () => {
    const r = await streamOnce({
      adapter: fakeAdapter([[{ type: "text", text: "ok" }, { type: "finish", finish_reason: "stop" }]], 1),
      model: "m",
      messages: [],
      tools: [],
      attempts: 3,
    });
    expect(r.text).toBe("ok");
  });

  it("tool desconhecida vira erro de resultado e o loop encerra", async () => {
    const messages: Message[] = [{ role: "user", content: "x" }];
    const r = await runTurn({
      adapter: fakeAdapter([
        [{ type: "tool-call", tool_call: { id: "t9", name: "inexistente", arguments: "{}" } }, { type: "finish", finish_reason: "stop" }],
        [{ type: "text", text: "ok" }, { type: "finish", finish_reason: "stop" }],
      ]),
      model: "m",
      messages,
      tools: [tool],
      allowlist: [],
      ask: async () => true,
      bus,
    });
    expect(r.records).toHaveLength(3);
    const toolMsg = r.records.find((x) => x.role === "tool");
    expect(toolMsg?.content).toContain("inexistente");
  });

  it("interrupto para o stream sem executar tools", async () => {
    const messages: Message[] = [{ role: "user", content: "x" }];
    const r = await runTurn({
      adapter: fakeAdapter([
        [
          { type: "text", text: "parcial" },
          { type: "tool-call", tool_call: { id: "t1", name: "bash", arguments: "{}" } },
          { type: "finish", finish_reason: "stop" },
        ],
      ]),
      model: "m",
      messages,
      tools: [tool],
      allowlist: ["ls"],
      ask: async () => false,
      bus,
      interrupted: () => true,
    });
    expect(r.interrupted).toBe(true);
    expect(messages).toHaveLength(2);
    expect(messages[1].role).toBe("assistant");
  });
});
