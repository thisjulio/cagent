import { describe, expect, test } from "bun:test";
import { benchmark } from "../src/benchmark";

describe("benchmark", () => {
  test("captures duration, memory and process metrics", async () => {
    const result = await benchmark("test.operation", () => "done", { scenario: "unit" });

    expect(result.value).toBe("done");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.start.rssBytes).toBeGreaterThan(0);
    expect(result.end.rssBytes).toBeGreaterThan(0);
    expect(result.metrics.spans).toHaveLength(1);
    expect(result.metrics.spans[0]?.name).toBe("test.operation");
    expect(result.metrics.metrics.map((metric) => metric.name)).toEqual([
      "test.operation.duration_ms",
      "test.operation.rss_delta_bytes",
    ]);
  });

  test("records exceptions without hiding them", async () => {
    await expect(benchmark("test.failure", () => {
      throw new Error("expected failure");
    })).rejects.toThrow("expected failure");
  });
});
