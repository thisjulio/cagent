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
      ["git status"],
      async () => false,
      eventBus,
    );

    expect(events[0]).toMatchObject({ title: "Executing bash" });
  });

  it("allowlist permits an exact command without a prompt", async () => {
    const res = await runToolPipeline(
      tool,
      { command: "git status" },
      ["git status"],
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

  it("allowlist matches exact command text only", () => {
    expect(permission(tool, { command: "git status" }, ["git status"])).toBe(
      "allow",
    );
    expect(
      permission(tool, { command: "git status --short" }, ["git status"]),
    ).toBe("ask");
    expect(permission(tool, { command: "git-evil status" }, ["git"])).toBe(
      "ask",
    );
    expect(
      permission(tool, { command: "git status && rm -rf /" }, ["git status"]),
    ).toBe("ask");
    expect(
      permission(tool, { command: "git status; rm -rf /" }, [
        "git status; rm -rf /",
      ]),
    ).toBe("ask");
    expect(permission(tool, { command: "echo 'a;b'" }, ["echo 'a;b'"])).toBe(
      "allow",
    );
    expect(
      permission(tool, { command: "echo $(rm -rf /)" }, ["echo $(rm -rf /)"]),
    ).toBe("ask");
    expect(permission(tool, { command: "echo $HOME" }, ["echo $HOME"])).toBe(
      "ask",
    );
    expect(permission(tool, { command: "git status" }, [])).toBe("ask");
  });

  it("read-only mode denies unmarked tools before hooks, ask, or execution", async () => {
    expect(
      permission(tool, { command: "git status" }, ["git status"], true),
    ).toBe("deny");
    expect(
      permission({ ...tool, name: "read_file" }, { path: "a.ts" }, [], true),
    ).toBe("deny");
    const events: unknown[] = [];
    const eventBus = new EventBus();
    eventBus.on("tools/denied", (event) => events.push(event));
    let hooks = 0;
    let approvals = 0;
    let executions = 0;
    const result = await runToolPipeline(
      defineTool("read_evil_write", "writes", {}, async () => {
        executions++;
        return { output: "written" };
      }),
      { path: "a.ts" },
      ['{"path":"a.ts"}'],
      async () => {
        approvals++;
        return true;
      },
      eventBus,
      {
        run: async () => {
          hooks++;
          return [];
        },
      },
      undefined,
      undefined,
      undefined,
      true,
    );
    expect(result.isError).toBe(true);
    expect(executions).toBe(0);
    expect(approvals).toBe(0);
    expect(hooks).toBe(0);
    expect(events).toHaveLength(1);
  });

  it("read-only mode permits only tools explicitly marked read-only", async () => {
    let executions = 0;
    const readTool = defineTool(
      "custom_lookup",
      "Reads data",
      {},
      async () => {
        executions++;
        return { output: "found" };
      },
      { readOnly: true },
    );
    const result = await runToolPipeline(
      readTool,
      { key: "value" },
      [],
      async () => false,
      bus,
      undefined,
      undefined,
      undefined,
      undefined,
      true,
    );
    expect(result.output).toBe("found");
    expect(result.isError).toBeUndefined();
    expect(executions).toBe(1);
  });
});
