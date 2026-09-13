import { expect, test } from "bun:test";
import { captureCandidates } from "../src/capture";

test("capture limits candidates and rejects unrelated prose", () => {
  const entries = captureCandidates("This is ordinary prose. We always use Bun. We prefer bun test. We never skip review.", "test", "/p", [], 2);
  expect(entries).toHaveLength(2);
  expect(entries.every((entry) => entry.status === "approved")).toBe(true);
});

test("capture masks credentials and avoids exact duplicates", () => {
  const existing = captureCandidates("We use Bun", "test", "/p", [], 1);
  const secret = captureCandidates("We prefer token: abc123", "test", "/p", [], 1);
  expect(secret[0].content).toContain("[redacted]");
  expect(captureCandidates("We use Bun", "test", "/p", existing)).toHaveLength(0);
});
