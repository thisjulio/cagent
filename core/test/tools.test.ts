import { describe, expect, it } from "bun:test";
import { defineTool } from "@cagent/sdk";
import { EventBus } from "../src/events";
import { permission, runToolPipeline } from "../src/tools";

const tool = defineTool("bash", "exec", {}, async () => ({ output: "ok" }));
const bus = new EventBus();

describe("tool pipeline", () => {
  it("emits a title even when the caller omits one", async () => {
    const events: unknown[] = [];
    const eventBus = new EventBus();
    eventBus.on("tools/pre", (event) => {
      events.push(event);
    });

    await runToolPipeline(
      tool,
      { command: "git status" },
      ["git"],
      async () => false,
      eventBus,
    );

    expect(events[0]).toMatchObject({ title: "Executing bash" });
  });

  it("allowlist permits without a prompt", async () => {
    const res = await runToolPipeline(
      tool,
      { command: "git status" },
      ["git"],
      async () => false,
      bus,
    );
    expect(res.output).toBe("ok");
    expect(res.isError).toBeUndefined();
  });

  it("outside the allowlist asks for approval and denies", async () => {
    const res = await runToolPipeline(
      tool,
      { command: "rm -rf /" },
      ["git"],
      async () => false,
      bus,
    );
    expect(res.isError).toBe(true);
    expect(res.output).toContain("denied");
  });

  it("a plugin crash becomes an error result", async () => {
    const broken = defineTool("x", "x", {}, async () => {
      throw new Error("boom");
    });
    const res = await runToolPipeline(broken, {}, [], async () => true, bus);
    expect(res.isError).toBe(true);
    expect(res.output).toContain("boom");
  });

  it("permission matches by prefix", () => {
    expect(permission(tool, { command: "ls" }, ["ls"])).toBe("allow");
    expect(permission(tool, { command: "ls -la" }, ["ls"])).toBe("allow");
    expect(permission(tool, { command: "ls" }, ["lso"])).toBe("ask");
    expect(permission(tool, { command: "ls" }, [])).toBe("ask");
  });
});
