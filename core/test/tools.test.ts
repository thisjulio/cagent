import { describe, expect, it } from "bun:test";
import { defineTool } from "@cagent/sdk";
import { EventBus } from "../src/events";
import { permission, runToolPipeline } from "../src/tools";

const tool = defineTool("bash", "exec", {}, async () => ({ output: "ok" }));
const bus = new EventBus();

describe("pipeline de tools", () => {
  it("allowlist permite sem prompt", async () => {
    const res = await runToolPipeline(tool, { command: "git status" }, ["git"], async () => false, bus);
    expect(res.output).toBe("ok");
    expect(res.isError).toBeUndefined();
  });

  it("fora da allowlist pede aprovação e nega", async () => {
    const res = await runToolPipeline(tool, { command: "rm -rf /" }, ["git"], async () => false, bus);
    expect(res.isError).toBe(true);
    expect(res.output).toContain("negou");
  });

  it("crash de plugin vira resultado de erro", async () => {
    const broken = defineTool("x", "x", {}, async () => {
      throw new Error("boom");
    });
    const res = await runToolPipeline(broken, {}, [], async () => true, bus);
    expect(res.isError).toBe(true);
    expect(res.output).toContain("boom");
  });

  it("permission casa por prefixo", () => {
    expect(permission(tool, { command: "ls" }, ["ls"])).toBe("allow");
    expect(permission(tool, { command: "ls -la" }, ["ls"])).toBe("allow");
    expect(permission(tool, { command: "ls" }, ["lso"])).toBe("ask");
    expect(permission(tool, { command: "ls" }, [])).toBe("ask");
  });
});
