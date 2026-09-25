import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "bun:test";
import { EventBus } from "../src/events";
import { Registry } from "../src/registry";
import { Session } from "../src/session/index";
import { Controller, type ControllerDeps } from "../src/controller/controller";

function deps(
  permissions = false,
  configOverrides: Record<string, unknown> = {},
): ControllerDeps {
  return {
    config: {
      plugins: [],
      allowlist: [],
      model: "openai/m1",
      permissions,
      ...configOverrides,
    } as ControllerDeps["config"],
    registry: new Registry(),
    bus: new EventBus(),
    adapter: {
      list_models: async () => ["model-a", "model-b"],
      prepare_call: async (o) => o,
      stream: async function* () {
        yield { type: "text", text: "hi" };
      },
    },
    model: "openai/m1",
    systemPrompt: "sys",
    sessionDir: fs.mkdtempSync(path.join(os.tmpdir(), "cagent-ui-")),
  };
}

describe("controller", () => {
  it("permits classified read-only tools in ask mode", async () => {
    const c = new Controller(deps(true));
    const readTool = { name: "read_file", readOnly: true } as never;
    expect(await c.ask(readTool, { path: "README.md" })).toBe(true);
    expect(c.state.pendingAsk).toBeNull();
  });

  it("refreshes the system message from the current project context", () => {
    let currentPrompt = "old";
    const c = new Controller({
      ...deps(),
      rebuildSystemPrompt: () => currentPrompt,
    });

    currentPrompt = "updated";
    c.refreshProjectContext();

    expect(c.systemPrompt).toBe("updated");
    expect(c.messages[0]).toEqual({ role: "system", content: "updated" });
  });

  it("defaults automatic compaction to 80% of the model context window", () => {
    const c = new Controller({ ...deps(), contextWindow: 100_000 });

    expect(c.state.contextWindow).toBe(100_000);
    expect(c.state.threshold).toBe(80_000);
  });

  it("renders a tool title and bash preview from the pre event", () => {
    const c = new Controller(deps());
    c.onToolPre({
      tool: "bash",
      args: { command: "bun run openjev-lab.ts" },
      title: "Executando openjev-lab.ts para validar funcionamento",
    });

    expect(c.state.chat.at(-1)).toMatchObject({
      toolName: "bash",
      title: "Executando openjev-lab.ts para validar funcionamento",
      cmd: "bun run openjev-lab.ts",
    });
  });

  it("provides a stable fallback title when the pre event omits one", () => {
    const c = new Controller(deps());
    c.onToolPre({ tool: "bash", args: { command: "pwd" } });

    expect(c.state.chat.at(-1)).toMatchObject({
      toolName: "bash",
      title: "Executing bash",
    });
  });

  it("uses the configured compaction percentage", () => {
    const c = new Controller({
      ...deps(false, { compact_threshold_percent: 75 }),
      contextWindow: 100_000,
    });

    expect(c.state.threshold).toBe(75_000);
  });

  it("compacts history into a checkpoint without losing the recent messages", async () => {
    const c = new Controller(deps(false, { compact_keep_tokens: 2_000 }));
    c.messages.push(
      { role: "user", content: "old ".repeat(750) },
      { role: "assistant", content: "recent ".repeat(750) },
      { role: "user", content: "latest ".repeat(750) },
    );

    await expect(c.compact()).resolves.toBeUndefined();

    expect(c.messages[1]?.content).toContain("[context checkpoint handoff]");
    expect(c.messages.at(-1)?.content).toBe("latest ".repeat(750));
    expect(
      c.messages.some((message) => message.content === "old ".repeat(750)),
    ).toBe(false);
  });

  it("requests fixed handoff sections and caps the persisted checkpoint summary", async () => {
    const d = deps(false, {
      compact_keep_tokens: 2_000,
      compact_summary_tokens: 50,
    });
    let prompt = "";
    d.adapter.stream = async function* ({ messages }) {
      prompt = String(messages[0]?.content ?? "");
      yield { type: "text", text: "handoff ".repeat(200) };
      yield { type: "finish", finish_reason: "stop" };
    };
    const c = new Controller(d);
    c.messages.push(
      { role: "user", content: "old ".repeat(750) },
      { role: "assistant", content: "recent ".repeat(750) },
      { role: "user", content: "latest ".repeat(750) },
    );

    await c.compact();

    expect(prompt).toContain("## Current state");
    expect(prompt).toContain("## Decisions");
    expect(prompt).toContain("## Changes");
    expect(prompt).toContain("## Verification");
    expect(prompt).toContain("## Pending work");
    expect(prompt).toContain("## References");
    expect(c.messages[1]?.content.length).toBeLessThanOrEqual(
      "[context checkpoint handoff]\n".length + 50 * 4,
    );
    const checkpoint = c.session.load().records.at(-1)?.payload.checkpoint as
      | { summary: string; recentMessages: unknown[]; version: number }
      | undefined;
    expect(checkpoint?.version).toBe(1);
    expect(checkpoint?.summary.length).toBeLessThanOrEqual(50 * 4);
    expect(checkpoint?.recentMessages.length).toBeGreaterThan(0);
  });

  it("compacts and retries after the provider reports a context limit", async () => {
    const d = deps(false, {
      compact_keep_tokens: 20,
    });
    let calls = 0;
    d.adapter.stream = async function* () {
      calls++;
      if (calls <= 3) throw new Error("maximum context length exceeded");
      if (calls === 4) {
        yield { type: "text", text: "checkpoint summary" };
        yield { type: "finish", finish_reason: "stop" };
        return;
      }
      yield { type: "text", text: "ok" };
      yield { type: "finish", finish_reason: "stop" };
    };
    const c = new Controller(d);
    c.state.title = "Existing session";
    c.messages.push(
      ...Array.from({ length: 8 }, (_, index) => ({
        role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
        content: `history ${index}`,
      })),
    );
    await c.submit("first");

    expect(calls).toBe(5);
    expect(
      c.messages.some(
        (message) =>
          typeof message.content === "string" &&
          message.content.includes("[context checkpoint handoff]"),
      ),
    ).toBe(true);
    expect(c.messages.some((message) => message.content === "history 6")).toBe(
      true,
    );
    expect(c.messages.some((message) => message.content === "history 7")).toBe(
      true,
    );
  });

  it("/skill activates the skill before submitting its prompt", async () => {
    const d = deps();
    const events: string[] = [];
    d.invokeSkill = async (name, args) => {
      events.push(`activate:${name}:${args}`);
      return {
        content:
          "Interview the user before implementation.\nTask: $ARGUMENTS".replace(
            "$ARGUMENTS",
            args,
          ),
        directory: "/tmp/grill-me",
      };
    };
    const c = new Controller(d);
    const originalSubmit = c.submit.bind(c);
    d.adapter.stream = async function* ({ messages }) {
      events.push(
        `messages:${messages.map((message) => message.content).join("|")}`,
      );
      yield { type: "text", text: "question" };
    };

    await originalSubmit("/skill grill-me implement clipboard support");

    expect(events[0]).toBe("activate:grill-me:implement clipboard support");
    expect(
      events.some((event) =>
        event.includes("Interview the user before implementation."),
      ),
    ).toBe(true);
    expect(
      events.some((event) => event.includes("implement clipboard support")),
    ).toBe(true);
    expect(
      c.messages.some(
        (message) =>
          message.role === "tool" &&
          message.content.includes('<skill_content name="grill-me">'),
      ),
    ).toBe(true);
    expect(
      c.state.chat.some(
        (item) =>
          item.kind === "tool" &&
          item.toolName === "skill" &&
          item.content.includes('<skill_content name="grill-me">'),
      ),
    ).toBe(true);
    expect(c.state.notice).toBe("");
  });

  it("does not duplicate an explicitly activated skill", async () => {
    const d = deps();
    d.invokeSkill = async () => ({
      content: "Ask one question at a time.",
      directory: "/tmp/grill-me",
    });
    const c = new Controller(d);

    expect(await c.invokeSkill("grill-me", "first task")).toBe(true);
    expect(await c.invokeSkill("grill-me", "second task")).toBe(true);

    expect(
      c.messages.filter(
        (message) =>
          message.role === "tool" &&
          message.content.includes('<skill_content name="grill-me">'),
      ),
    ).toHaveLength(1);
  });

  it("runs an explicitly invoked skill without arguments", async () => {
    const d = deps();
    d.invokeSkill = async () => ({
      content: "Start the workflow now.",
      directory: "/tmp/grill-me",
    });
    const c = new Controller(d);

    await c.submit("/skill grill-me");

    expect(
      c.messages.some(
        (message) =>
          message.role === "user" &&
          message.content === "Apply the grill-me skill now.",
      ),
    ).toBe(true);
  });

  it("/skill rejects malformed names instead of invoking a partial skill", async () => {
    const d = deps();
    let invoked = false;
    d.invokeSkill = async () => {
      invoked = true;
      return "skill";
    };
    const c = new Controller(d);

    await c.submit("/skill grill-me/extra prompt");

    expect(invoked).toBe(false);
    expect(c.state.notice).toContain("skill not found");
  });

  it("types and submits a message (user enters the context)", async () => {
    const c = new Controller(deps());
    c.setInput("hi");
    const inputKey = c.state.inputKey;
    expect(c.state.input).toBe("hi");
    const p = c.submit("hi");
    await new Promise((r) => setTimeout(r, 50));
    await p;
    const kinds = c.state.chat.map((i) => i.kind);
    expect(kinds).toContain("user");
    expect(kinds).toContain("assistant");
    expect(c.state.chat[c.state.chat.length - 1].content).toBe("hi");
    expect(
      c.messages.some((m) => m.role === "user" && m.content === "hi"),
    ).toBe(true);
    expect(c.state.input).toBe("");
    expect(c.state.inputKey).toBe(inputKey + 1);
  });

  it("re-injects current date when the context is stale", async () => {
    const c = new Controller(deps());
    c.envStamp = 0;
    const p = c.submit("hi");
    await new Promise((r) => setTimeout(r, 50));
    await p;
    expect(
      c.messages.some(
        (m) =>
          m.role === "user" && m.content.startsWith("[context] Date/time:"),
      ),
    ).toBe(true);
  });

  it("does not re-inject with a fresh context", async () => {
    const c = new Controller(deps());
    const p = c.submit("hi");
    await new Promise((r) => setTimeout(r, 50));
    await p;
    expect(
      c.messages.some((m) => m.content.startsWith("[context] Date/time:")),
    ).toBe(false);
  });

  it("pendingAsk: esc nega; y aprova", async () => {
    const c = new Controller(deps(true));
    const p = c.ask({ name: "bash" }, { command: "ls" });
    expect(c.state.pendingAsk).not.toBeNull();
    c.handleKey({ escape: true }, "");
    await expect(p).resolves.toBe(false);
    const p2 = c.ask({ name: "bash" }, { command: "ls" });
    c.handleKey({}, "y");
    await expect(p2).resolves.toBe(true);
  });

  it("'a' adds the command to the session allowlist", async () => {
    const d = deps(true);
    const c = new Controller(d);
    const p = c.ask({ name: "bash" }, { command: "rm -rf node_modules" });
    c.handleKey({}, "a");
    await expect(p).resolves.toBe(true);
    expect(d.config.allowlist).toContain("rm -rf node_modules");
  });

  it("live tool items appear in chat through bus events", async () => {
    const c = new Controller(deps());
    c.onToolPre({ tool: "bash", args: { command: "ls -la" } });
    const last = c.state.chat[c.state.chat.length - 1];
    expect(last.kind).toBe("tool");
    expect(last.toolName).toBe("bash");
    expect(last.cmd).toBe("ls -la");
    expect(last.running).toBe(true);
    c.onToolStream({ tool: "bash", chunk: "a\n" });
    expect(c.state.chat[c.state.chat.length - 1].content).toBe("a\n");
    c.onToolPost({ tool: "bash", result: { output: "a\nb" } });
    const done = c.state.chat[c.state.chat.length - 1];
    expect(done.running).toBe(false);
    expect(done.content).toBe("a\n");
  });

  it("keeps structured tool output collapsed until the user expands it", () => {
    const c = new Controller(deps());
    c.onToolPre({ tool: "bash", args: { command: "printf output" } });
    c.onToolPost({
      tool: "bash",
      result: {
        output: "output",
        display: { kind: "terminal", stdout: "output" },
      },
    });
    const done = c.state.chat[c.state.chat.length - 1];
    expect(done.expanded).toBeFalsy();
    c.handleKey({ ctrl: true }, "o");
    expect(c.state.chat[c.state.chat.length - 1].expanded).toBe(true);
  });

  it("onToolDenied marks a denied item", () => {
    const c = new Controller(deps());
    c.onToolDenied({ tool: "bash", args: { command: "rm -rf /" } });
    const last = c.state.chat[c.state.chat.length - 1];
    expect(last.kind).toBe("tool");
    expect(last.denied).toBe(true);
    expect(last.isError).toBe(true);
  });

  it("ctrl+o expands the last tool item", () => {
    const c = new Controller(deps());
    c.onToolPre({ tool: "bash", args: { command: "ls" } });
    c.onToolPost({ tool: "bash", result: { output: "ok" } });
    c.handleKey({ ctrl: true }, "o");
    expect(c.state.chat[c.state.chat.length - 1].expanded).toBe(true);
    c.handleKey({ ctrl: true }, "o");
    expect(c.state.chat[c.state.chat.length - 1].expanded).toBe(false);
  });

  it("up arrow with empty input recalls the last sent user message", async () => {
    const c = new Controller(deps());
    c.state.inputKey = 0;
    await c.submit("hello");
    c.state.input = "";
    c.handleKey({ upArrow: true }, "");
    expect(c.state.input).toBe("hello");
    expect(c.state.inputKey).toBe(2);
  });

  it("up arrow with non-empty input leaves the input untouched", () => {
    const c = new Controller(deps());
    c.messages.push({ role: "user", content: "hello" });
    c.state.input = "partial";
    c.handleKey({ upArrow: true }, "");
    expect(c.state.input).toBe("partial");
  });

  it("up arrow with empty history leaves the input empty", () => {
    const c = new Controller(deps());
    c.latestUserMessage = () => null;
    c.state.input = "";
    c.handleKey({ upArrow: true }, "");
    expect(c.state.input).toBe("");
  });
});
