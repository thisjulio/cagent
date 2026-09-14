import { expect, test } from "bun:test";
import { captureCandidates } from "../src/capture";

test("capture limits candidates and rejects unrelated prose", () => {
  const entries = captureCandidates("This is ordinary prose. We always use Bun. We prefer bun test. We never skip review.", "test", "/p", [], 2);
  expect(entries).toHaveLength(2);
  expect(entries.every((entry) => entry.status === "approved")).toBe(true);
});

test("capture ignores internal events and requires an explicit declaration", () => {
  expect(captureCandidates('{"status":"pending","operation":"update"}', "turn.completed", "/project", [])).toHaveLength(0);
  expect(captureCandidates("The tool read_file always uses bun test.", "turn.completed", "/project", [])).toHaveLength(0);
  expect(captureCandidates("We always use bun test for validation.", "turn.completed", "/project", [])).toHaveLength(1);
  expect(captureCandidates("Use bun test for validation.", "turn.completed", "/project", [])).toHaveLength(0);
});

test("capture masks credentials and avoids exact duplicates", () => {
  const existing = captureCandidates("We use Bun", "test", "/p", [], 1);
  const secret = captureCandidates("We prefer token: abc123", "test", "/p", [], 1);
  expect(secret[0].content).toContain("[redacted]");
  expect(captureCandidates("We use Bun", "test", "/p", existing)).toHaveLength(0);
});
