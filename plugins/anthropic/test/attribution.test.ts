import { describe, expect, test } from "bun:test";
import { billingAttribution, resolveEntrypoint } from "../src/attribution";

describe("billingAttribution", () => {
  test("matches OpenClaude's dynamic fingerprint format", () => {
    const previous = process.env.CLAUDE_CODE_ENTRYPOINT;
    process.env.CLAUDE_CODE_ENTRYPOINT = "cli";
    expect(
      billingAttribution([
        { role: "user", content: "Reply with exactly: SONNET46_CAGENT_OK" },
      ]),
    ).toBe(
      "x-anthropic-billing-header: cc_version=0.1.0.0a7; cc_entrypoint=cli;",
    );
    if (previous === undefined) delete process.env.CLAUDE_CODE_ENTRYPOINT;
    else process.env.CLAUDE_CODE_ENTRYPOINT = previous;
  });

  test("uses an empty-message fingerprint when no user message is present", () => {
    expect(billingAttribution([])).toMatch(
      /^x-anthropic-billing-header: cc_version=0\.1\.0\.[0-9a-f]{3}; cc_entrypoint=/,
    );
  });
});

describe("resolveEntrypoint", () => {
  test("preserves a configured entrypoint", () => {
    expect(
      resolveEntrypoint({ CLAUDE_CODE_ENTRYPOINT: "sdk-ts" }, [], false),
    ).toBe("sdk-ts");
  });

  test("detects MCP serve before non-interactive mode", () => {
    expect(resolveEntrypoint({}, ["--debug", "mcp", "serve"], false)).toBe(
      "mcp",
    );
  });

  test("detects GitHub Actions", () => {
    expect(resolveEntrypoint({ CLAUDE_CODE_ACTION: "1" }, [], false)).toBe(
      "claude-code-github-action",
    );
  });

  test("uses cli for interactive and sdk-cli otherwise", () => {
    expect(resolveEntrypoint({}, [], true)).toBe("cli");
    expect(resolveEntrypoint({}, [], false)).toBe("sdk-cli");
  });
});
