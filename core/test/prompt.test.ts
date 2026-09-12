import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "bun:test";
import { buildSystemPrompt } from "../src/prompt";
import { envFacts } from "../src/envinfo";

describe("buildSystemPrompt", () => {
  const base = fs.mkdtempSync("/tmp/cagent-prompt-");
  const dir = fs.mkdtempSync(path.join(base, "sub"));
  fs.writeFileSync(path.join(base, "AGENTS.md"), "parent rule");
  const p = buildSystemPrompt(dir, new Map([["Tools", "plugin content"]]));
  expect(p).toContain("cagent");
  expect(p).toContain("## Environment");
  expect(p).toContain("parent rule");
  expect(p).toContain("## Tools");
});

describe("AGENTS.md: CLAUDE.md fallback + config instructions", () => {
  const dir = fs.mkdtempSync("/tmp/cagent-md-");
  fs.writeFileSync(path.join(dir, "CLAUDE.md"), "claude rule");
  fs.writeFileSync(path.join(dir, "extra.md"), "extra rules");
  const p = buildSystemPrompt(dir, new Map(), ["extra.md"]);
  expect(p).toContain("claude rule");
  expect(p).toContain("extra rules");
});

describe("envFacts", () => {
  const dir = fs.mkdtempSync("/tmp/cagent-env-");
  const s = envFacts(dir);
  expect(s).toContain(`CWD: ${dir}`);
  expect(s).toContain("Local timezone:");
  expect(s).toContain("Git repo: no");
});
