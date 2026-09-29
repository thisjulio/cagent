import { expect, it } from "bun:test";
import { type LlmCallOptions, type ProviderAdapter } from "@cagent/sdk";
import { streamOnce } from "../src/loop";

it("does not retry after partial output to avoid duplicating streamed content", async () => {
  let calls = 0;
  const seen: string[] = [];
  const adapter: ProviderAdapter = {
    async list_models() {
      return ["m"];
    },
    async prepare_call(options: LlmCallOptions) {
      return options;
    },
    async *stream() {
      calls++;
      yield { type: "reasoning", text: "partial" };
      throw new Error("incomplete stream");
    },
  };
  await expect(
    streamOnce({
      adapter,
      model: "m",
      messages: [],
      tools: [],
      onReasoning: (text) => seen.push(text),
    }),
  ).rejects.toThrow("incomplete stream");
  expect(calls).toBe(1);
  expect(seen).toEqual(["partial"]);
});
