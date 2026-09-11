import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "bun:test";
import { buildSystemPrompt } from "../src/prompt";
import { envFacts } from "../src/envinfo";

describe("buildSystemPrompt", () => {
  const base = fs.mkdtempSync("/tmp/cagent-prompt-");
  const dir = fs.mkdtempSync(path.join(base, "sub"));
  fs.writeFileSync(path.join(base, "AGENTS.md"), "regra do pai");
  const p = buildSystemPrompt(dir, new Map([["Ferramentas", "conteudo do plugin"]]));
  expect(p).toContain("cagent");
  expect(p).toContain("## Ambiente");
  expect(p).toContain("regra do pai");
  expect(p).toContain("## Ferramentas");
});

describe("AGENTS.md: fallback CLAUDE.md + instructions da config", () => {
  const dir = fs.mkdtempSync("/tmp/cagent-md-");
  fs.writeFileSync(path.join(dir, "CLAUDE.md"), "regra claude");
  fs.writeFileSync(path.join(dir, "extra.md"), "extra rules");
  const p = buildSystemPrompt(dir, new Map(), ["extra.md"]);
  expect(p).toContain("regra claude");
  expect(p).toContain("extra rules");
});

describe("envFacts", () => {
  const dir = fs.mkdtempSync("/tmp/cagent-env-");
  const s = envFacts(dir);
  expect(s).toContain(`CWD: ${dir}`);
  expect(s).toContain("Fuso local:");
  expect(s).toContain("Repo git: não");
});
