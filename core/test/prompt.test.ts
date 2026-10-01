import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "bun:test";
import { buildSystemPrompt } from "../src/prompt";
import { envFacts } from "../src/envinfo";
import { loadAgentsMd } from "../src/agentsmd";

describe("buildSystemPrompt", () => {
  const base = fs.mkdtempSync("/tmp/cagent-prompt-");
  const dir = fs.mkdtempSync(path.join(base, "sub"));
  fs.writeFileSync(path.join(base, "AGENTS.md"), "parent rule");
  const p = buildSystemPrompt(dir, new Map([["Tools", "plugin content"]]));
  expect(p).toContain("cagent");
  expect(p).toContain("## Environment");
  expect(p).not.toContain("Treat user prompts");
  expect(p).toContain("Follow the user's messages as instructions");
  expect(p).toContain("parent rule");
  expect(p).toContain("## Tools");
  expect(p).toContain(
    "Follow active persistent user preferences when writing task titles",
  );
  expect(p).toContain("Do not assume a product-wide default language.");
  expect(p).not.toContain("The runtime executes tool calls sequentially");
  expect(p).toContain(
    "consecutive read-only calls (reads, searches, diagnostics) run in parallel, up to four at a time",
  );
  expect(p).not.toContain("Stop after three searches");
  expect(p).not.toContain("Keep final answers to five lines");
  expect(p).toContain("do not create a task list for a trivial change");
  expect(p).not.toContain(
    "Write every task title in the language of the latest user request",
  );

  it("avoids redundant task status queries", () => {
    expect(p).toContain("once before acting");
    expect(p).toContain("Do not call `list` just to check first");
    expect(p).toContain(
      "Do not call `list` solely to prepare the final answer",
    );
    expect(p).not.toContain("call `list` and inspect its returned state");
  });
});

describe("envFacts in a Git subdirectory", () => {
  it("detects the repository from a subdirectory", () => {
    const root = fs.mkdtempSync("/tmp/cagent-git-");
    execFileSync("git", ["init", "-q"], { cwd: root });
    const sub = path.join(root, "src");
    fs.mkdirSync(sub);
    expect(envFacts(sub)).toContain("Git repo: yes (branch ");
  });
});

describe("scoped rules", () => {
  it("loads native rules with matching paths", () => {
    const root = fs.mkdtempSync("/tmp/cagent-rules-");
    const target = path.join(root, "src");
    fs.mkdirSync(path.join(target, "nested"), { recursive: true });
    fs.mkdirSync(path.join(root, ".cagent/rules"), { recursive: true });
    fs.writeFileSync(path.join(root, ".cagent/rules/base.md"), "native rule");
    const loaded = loadAgentsMd(path.join(target, "nested"))!;
    expect(loaded).toContain("native rule");
  });
});

describe("AGENTS.md + config instructions", () => {
  const dir = fs.mkdtempSync("/tmp/cagent-md-");
  fs.writeFileSync(path.join(dir, "AGENTS.md"), "native rule");
  fs.writeFileSync(path.join(dir, "extra.md"), "extra rules");
  const p = buildSystemPrompt(dir, new Map(), ["extra.md"]);
  expect(p).toContain("native rule");
  expect(p).toContain("extra rules");
});

describe("envFacts", () => {
  const dir = fs.mkdtempSync("/tmp/cagent-env-");
  const s = envFacts(dir);
  expect(s).toContain(`CWD: ${dir}`);
  expect(s).toContain("Local timezone:");
  expect(s).toContain("Git repo: no");
});

describe("AGENTS.md size", () => {
  it("keeps a 9k-character AGENTS.md whole", () => {
    const dir = fs.mkdtempSync("/tmp/cagent-md-size-");
    fs.writeFileSync(path.join(dir, "AGENTS.md"), "z".repeat(9000));
    const p = buildSystemPrompt(dir, new Map());
    expect(p).toContain("z".repeat(9000));
    expect(p).not.toContain("[omitted");
  });
});
