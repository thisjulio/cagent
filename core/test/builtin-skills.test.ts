import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "bun:test";
import { addBuiltinSkills } from "../src/skills/builtin";

const empty = () => ({ skills: [], byName: new Map() });

describe("builtin skills", () => {
  it("omits cagent-development outside the cagent repository", () => {
    const dir = fs.mkdtempSync("/tmp/cagent-builtin-");
    const catalog = addBuiltinSkills(empty(), dir);
    expect(catalog.byName.has("cagent-development")).toBe(false);
  });

  it("includes cagent-development inside the cagent repository", () => {
    const root = fs.mkdtempSync("/tmp/cagent-builtin-");
    fs.writeFileSync(path.join(root, "package.json"), '{"name":"cagent"}');
    const nested = path.join(root, "core", "src");
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(
      path.join(root, "core", "package.json"),
      '{"name":"@cagent/core"}',
    );
    const catalog = addBuiltinSkills(empty(), nested);
    expect(catalog.byName.has("cagent-development")).toBe(true);
  });
});
