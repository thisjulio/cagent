import { describe, expect, test } from "bun:test";
import { calculateUsage } from "../src/usage";

describe("usage calculator", () => {
  test("sums provider tokens and calculates priced-model cost", () => {
    expect(
      calculateUsage(
        [
          {
            inputTokens: 1_000_000,
            outputTokens: 1_000_000,
            cacheReadTokens: 1_000_000,
            cacheCreationTokens: 1_000_000,
          },
        ],
        "openai/gpt-4o",
      ),
    ).toEqual({
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheReadTokens: 1_000_000,
      cacheCreationTokens: 1_000_000,
      costUsd: 16.25,
    });
  });

  test("returns unavailable cost for unknown models", () => {
    expect(calculateUsage([], "provider/unknown").costUsd).toBeNull();
  });
});
