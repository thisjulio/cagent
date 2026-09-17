import { describe, expect, test } from "bun:test";
import { parseCliArgs } from "../src/cli-args";

describe("CLI arguments", () => {
  test("combines stdin and positional prompts", () => {
    const result = parseCliArgs(["--prompt", "second", "first"], "from pipe");
    expect(result.prompt).toBe("from pipe\n\nsecond\n\nfirst");
  });

  test("parses telemetry overrides", () => {
    expect(parseCliArgs(["--telemetry"]).telemetry).toBe(true);
    expect(parseCliArgs(["--no-telemetry"]).telemetry).toBe(false);
  });

  test("parses common options", () => {
    const result = parseCliArgs(["--yes", "--output", "jsonl", "--timeout", "2m", "--variant", "ilow", "task"]);
    expect(result.permissionMode).toBe("auto");
    expect(result.output).toBe("jsonl");
    expect(result.timeoutMs).toBe(120000);
    expect(result.variant).toBe("ilow");
  });

  test("rejects conflicting sessions", () => {
    expect(() => parseCliArgs(["--session", "old", "--new-session", "task"])).toThrow();
  });

  test("parses the version flag", () => {
    expect(parseCliArgs(["--version"]).version).toBe(true);
  });
});
