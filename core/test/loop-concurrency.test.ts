import { expect, it } from "bun:test";
import { defineTool, type Message, type ProviderAdapter } from "@cagent/sdk";
import { EventBus } from "../src/events";
import { runTurn } from "../src/loop";

async function exercise(names: string[], maxToolCalls?: number) {
  let active = 0;
  let peak = 0;
  const events: string[] = [];
  const messages: Message[] = [{ role: "user", content: "Run tools" }];
  let streamed = false;
  const adapter: ProviderAdapter = {
    async list_models() {
      return ["m"];
    },
    async prepare_call(options) {
      return options;
    },
    async *stream() {
      if (!streamed) {
        streamed = true;
        for (const [index, name] of names.entries()) {
          yield {
            type: "tool-call",
            tool_call: {
              id: String(index),
              name,
              arguments: JSON.stringify({ index }),
            },
          };
        }
      }
      yield { type: "finish", finish_reason: "stop" };
    },
  };
  const tools = ["read", "write", "bash"].map((name) => {
    const tool = defineTool(name, name, {}, async (args) => {
      const index = args.index as number;
      events.push(`start:${index}`);
      active++;
      peak = Math.max(peak, active);
      await Bun.sleep(index === 0 ? 30 : 1);
      active--;
      events.push(`end:${index}`);
      return { output: String(index) };
    });
    return { ...tool, readOnly: name === "read" };
  });
  const result = await runTurn({
    adapter,
    model: "m",
    messages,
    tools,
    allowlist: [],
    ask: async () => true,
    bus: new EventBus(),
    maxToolCalls,
  });
  return { result, messages, events, peak };
}

it("runs consecutive reads concurrently with a limit of four and ordered results", async () => {
  const { peak, messages, result } = await exercise(Array(6).fill("read"));
  expect(peak).toBe(4);
  expect(
    messages
      .filter((message) => message.role === "tool")
      .map((message) => message.content),
  ).toEqual(["0", "1", "2", "3", "4", "5"]);
  expect(
    result.records
      .filter((record) => record.role === "tool")
      .map((record) => record.tool_call_id),
  ).toEqual(["0", "1", "2", "3", "4", "5"]);
  expect(
    messages
      .find((message) => message.role === "assistant")
      ?.tool_calls?.every((call) => JSON.parse(call.arguments)._cagent.title),
  ).toBe(true);
});

it("keeps writes and bash as serial barriers between read groups", async () => {
  const { events, peak } = await exercise([
    "read",
    "read",
    "write",
    "bash",
    "read",
    "read",
  ]);
  expect(peak).toBe(2);
  expect(events.indexOf("start:2")).toBeGreaterThan(events.indexOf("end:0"));
  expect(events.indexOf("start:2")).toBeGreaterThan(events.indexOf("end:1"));
  expect(events.indexOf("start:3")).toBeGreaterThan(events.indexOf("end:2"));
  expect(events.indexOf("start:4")).toBeGreaterThan(events.indexOf("end:3"));
});

it("does not launch reads beyond the tool-call budget", async () => {
  const { result, messages, events, peak } = await exercise(
    Array(5).fill("read"),
    2,
  );
  expect(peak).toBe(2);
  expect(events.filter((event) => event.startsWith("start:"))).toEqual([
    "start:0",
    "start:1",
  ]);
  expect(result.budgetExhausted).toBe(true);
  expect(messages.filter((message) => message.role === "tool")).toHaveLength(5);
});
