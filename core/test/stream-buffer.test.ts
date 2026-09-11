import { expect, test } from "bun:test";
import { appendCapped } from "../src/stream-buffer";

test("stream buffer mantém tamanho limitado e o trecho mais recente", () => {
  const result = appendCapped("a".repeat(8), "b".repeat(8), 12);
  expect(result.length).toBeLessThanOrEqual(12);
  expect(result.endsWith("b".repeat(8))).toBe(true);
});
