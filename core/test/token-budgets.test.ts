import { describe, expect, it } from "bun:test";
import { defineTool, type Message, type ProviderAdapter } from "@cagent/sdk";
import { EventBus } from "../src/events";
import { runTurn } from "../src/loop";
import { runToolCall } from "../src/tool-loop";
import { selectRequestWindow } from "../src/context/request-window";
import { truncateAgentsMd, buildStablePrompt } from "../src/prompt";

function endlessToolAdapter(): ProviderAdapter {
  let n = 0;
  return {
    async list_models() {
      return ["m"];
    },
    async prepare_call(o) {
      return o;
    },
    async *stream() {
      n++;
      yield {
        type: "tool-call",
        tool_call: { id: `t${n}`, name: "bash", arguments: "{}" },
      };
      yield { type: "finish", finish_reason: "stop" };
    },
  };
}

const bash = defineTool("bash", "exec", {}, async () => ({ output: "ok" }));

describe("turn and tool budgets", () => {
  it("stops a recursive prompt with ERR_TURN_BUDGET", async () => {
    const err = await runTurn({
      adapter: endlessToolAdapter(),
      model: "m",
      messages: [{ role: "user", content: "loop forever" }],
      tools: [bash],
      allowlist: [],
      ask: async () => true,
      bus: new EventBus(),
      maxTurns: 3,
    }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error & { code?: string }).code).toBe("ERR_TURN_BUDGET");
  });

  it("stops at the default 25 turns without explicit maxTurns", async () => {
    let streams = 0;
    const adapter = endlessToolAdapter();
    const inner = adapter.stream.bind(adapter);
    adapter.stream = (req, signal) => {
      streams++;
      return inner(req, signal);
    };
    const err = await runTurn({
      adapter,
      model: "m",
      messages: [{ role: "user", content: "loop forever" }],
      tools: [bash],
      allowlist: [],
      ask: async () => true,
      bus: new EventBus(),
    }).catch((e) => e);
    expect((err as Error & { code?: string }).code).toBe("ERR_TURN_BUDGET");
    expect(streams).toBeLessThanOrEqual(25);
  });

  it("stops with ERR_TOOL_BUDGET when a turn fans out too many calls", async () => {
    const adapter: ProviderAdapter = {
      async list_models() {
        return ["m"];
      },
      async prepare_call(o) {
        return o;
      },
      async *stream() {
        yield {
          type: "tool-call",
          tool_call: { id: "a", name: "bash", arguments: "{}" },
        };
        yield {
          type: "tool-call",
          tool_call: { id: "b", name: "bash", arguments: "{}" },
        };
        yield { type: "finish", finish_reason: "stop" };
      },
    };
    const err = await runTurn({
      adapter,
      model: "m",
      messages: [{ role: "user", content: "fan out" }],
      tools: [bash],
      allowlist: [],
      ask: async () => true,
      bus: new EventBus(),
      maxToolCalls: 1,
    }).catch((e) => e);
    expect((err as Error & { code?: string }).code).toBe("ERR_TOOL_BUDGET");
  });

  it("blocks an over-budget turn input before streaming", async () => {
    let streamed = false;
    const adapter: ProviderAdapter = {
      async list_models() {
        return ["m"];
      },
      async prepare_call(o) {
        return o;
      },
      estimate_tokens: () => 200_000,
      async *stream() {
        streamed = true;
        yield { type: "finish", finish_reason: "stop" };
      },
    };
    const err = await runTurn({
      adapter,
      model: "m",
      messages: [{ role: "user", content: "huge" }],
      tools: [],
      allowlist: [],
      ask: async () => true,
      bus: new EventBus(),
      maxInputTokensPerTurn: 150_000,
    }).catch((e) => e);
    expect((err as Error & { code?: string }).code).toBe("ERR_TURN_BUDGET");
    expect(streamed).toBe(false);
  });
});

describe("request window", () => {
  it("reports included < total for a long session on a small window", () => {
    const messages: Message[] = [];
    for (let i = 0; i < 50; i++) {
      messages.push({ role: "user", content: `q${i} ${"x".repeat(2000)}` });
      messages.push({ role: "assistant", content: `a${i}` });
    }
    const window = selectRequestWindow(messages, {
      contextWindow: 20_000,
      recentMessages: 24,
    });
    expect(window.included).toBeLessThan(messages.length);
    expect(window.omitted).toBeGreaterThan(0);
  });

  it("preserves the latest user message under a tight budget", () => {
    const messages: Message[] = [
      { role: "system", content: "S" },
      { role: "user", content: `latest ${"x".repeat(1000)}` },
    ];
    const window = selectRequestWindow(messages, {
      contextWindow: 100,
      recentMessages: 24,
    });
    expect(window.messages.some((m) => m.role === "user")).toBe(true);
  });
});

describe("system prompt budget", () => {
  it("truncates project conventions to 4k chars with an omitted marker", () => {
    const out = truncateAgentsMd("y".repeat(6000));
    expect(out.length).toBeLessThan(6000);
    expect(out).toContain("[omitted 2000 chars");
  });

  it("keeps the stable prefix free of task protocol", () => {
    const stable = buildStablePrompt(process.cwd());
    expect(stable).toContain("cagent");
    expect(stable).not.toContain("Task protocol");
  });
});

describe("tool output budget", () => {
  it("sends 4k to the model while retaining the full transcript", async () => {
    const big = defineTool("bash", "exec", {}, async () => ({
      output: "z".repeat(10_000),
    }));
    const events: unknown[] = [];
    const bus = new EventBus();
    bus.on("tool.completed", (p) => events.push(p));
    const messages: Message[] = [
      { role: "user", content: "run" },
      {
        role: "assistant",
        content: "",
        tool_calls: [{ id: "t1", name: "bash", arguments: "{}" }],
      },
    ];
    const ctx: Parameters<typeof runToolCall>[0] = {
      opts: {
        adapter: endlessToolAdapter(),
        model: "m",
        messages,
        tools: [big],
        allowlist: [],
        ask: async () => true,
        bus,
      },
      nameToCanonical: {},
      records: [],
      evidence: [],
      changesWorkspace: false,
    };
    await runToolCall(ctx, { id: "t1", name: "bash", arguments: "{}" });
    const sent = messages.at(-1);
    expect(String(sent?.content).length).toBeLessThan(5000);
    expect(String(sent?.content)).toContain("[tool output truncated");
    expect(ctx.records[0]?.content.length).toBe(10_000);
    expect(events).toHaveLength(1);
    expect(
      (events[0] as { data: { outputLength: number } }).data.outputLength,
    ).toBe(10_000);
  });
});
