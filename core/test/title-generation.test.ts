import { describe, expect, it } from "bun:test";
import { sanitizeTitle } from "../src/controller/sessions";
import { ensureToolTitle } from "../src/tool-title";

describe("sanitizeTitle", () => {
  it("removes conversational prefixes", () => {
    expect(sanitizeTitle("I'll check the git status")).toBe(
      "check the git status",
    );
    expect(sanitizeTitle("I will commit all changes")).toBe(
      "commit all changes",
    );
    expect(sanitizeTitle("Let me debug this")).toBe("debug this");
    expect(sanitizeTitle("Here is the title")).toBe("the title");
    expect(sanitizeTitle("Sure, I'll do that")).toBe("I'll do that");
    expect(sanitizeTitle("OK, let's go")).toBe("let's go");
    expect(sanitizeTitle("Alright, starting now")).toBe("starting now");
    expect(sanitizeTitle("Got it, working on it")).toBe("working on it");
    expect(sanitizeTitle("Will do")).toBe("Will do");
    expect(sanitizeTitle("Done")).toBe("Done");
  });

  it("preserves legitimate titles", () => {
    expect(sanitizeTitle("Commit Git Changes")).toBe("Commit Git Changes");
    expect(sanitizeTitle("Debug Login Timeout")).toBe("Debug Login Timeout");
    expect(sanitizeTitle("Improve Session Titles")).toBe(
      "Improve Session Titles",
    );
    expect(sanitizeTitle("Fix broken build")).toBe("Fix broken build");
  });
});

describe("ensureToolTitle", () => {
  it("keeps a supplied title after normalization", () => {
    expect(ensureToolTitle("  Run checks  ", "bash")).toBe("Run checks");
  });

  it("generates a title when metadata is absent or blank", () => {
    expect(
      ensureToolTitle(undefined, "bash", "shell", { command: "bun test" }),
    ).toBe("Run bun");
    expect(
      ensureToolTitle("   ", "read_file", "read", { path: "src/total.ts" }),
    ).toBe("Read total.ts");
  });
});
