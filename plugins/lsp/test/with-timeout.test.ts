import { describe, expect, test } from "bun:test";
import { withTimeout } from "../src/with-timeout";

describe("withTimeout", () => {
  test("resolves when the inner promise settles in time", async () => {
    await expect(
      withTimeout(Promise.resolve(1), 50, "timed out"),
    ).resolves.toBe(1);
  });

  test("rejects when the inner promise hangs", async () => {
    await expect(
      withTimeout(new Promise(() => undefined), 10, "hung"),
    ).rejects.toThrow("hung");
  });
});
