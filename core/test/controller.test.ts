import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "bun:test";
import { EventBus } from "../src/events";
import { Registry } from "../src/registry";
import { Session } from "../src/session";
import { Controller, type ControllerDeps } from "../src/controller/controller";

function deps(permissions = false, configOverrides: Record<string, unknown> = {}): ControllerDeps {
  return {
    config: { plugins: [], allowlist: [], model: "openai/m1", permissions, ...configOverrides } as ControllerDeps["config"],
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
  it("/skill activates the skill before submitting its prompt", async () => {
    const d = deps();
    const events: string[] = [];
    d.invokeSkill = async (name, args) => {
      events.push(`activate:${name}:${args}`);
      return { content: "Interview the user before implementation.\nTask: $ARGUMENTS".replace("$ARGUMENTS", args), directory: "/tmp/grill-me" };
    };
    const c = new Controller(d);
    const originalSubmit = c.submit.bind(c);
    d.adapter.stream = async function* ({ messages }) {
      events.push(`messages:${messages.map((message) => message.content).join("|")}`);
      yield { type: "text", text: "question" };
    };

    await originalSubmit("/skill grill-me implement clipboard support");

    expect(events[0]).toBe("activate:grill-me:implement clipboard support");
    expect(events.some((event) => event.includes("Interview the user before implementation."))).toBe(true);
    expect(events.some((event) => event.includes("implement clipboard support"))).toBe(true);
    expect(c.messages.some((message) => message.role === "tool" && message.content.includes("<skill_content name=\"grill-me\">"))).toBe(true);
    expect(c.state.chat.some((item) => item.kind === "tool" && item.toolName === "skill" && item.content.includes("<skill_content name=\"grill-me\">"))).toBe(true);
    expect(c.state.notice).toBe("");
  });

  it("does not duplicate an explicitly activated skill", async () => {
    const d = deps();
    d.invokeSkill = async () => ({ content: "Ask one question at a time.", directory: "/tmp/grill-me" });
    const c = new Controller(d);

    expect(await c.invokeSkill("grill-me", "first task")).toBe(true);
    expect(await c.invokeSkill("grill-me", "second task")).toBe(true);

    expect(c.messages.filter((message) => message.role === "tool" && message.content.includes("<skill_content name=\"grill-me\">"))).toHaveLength(1);
  });

  it("runs an explicitly invoked skill without arguments", async () => {
    const d = deps();
    d.invokeSkill = async () => ({ content: "Start the workflow now.", directory: "/tmp/grill-me" });
    const c = new Controller(d);

    await c.submit("/skill grill-me");

    expect(c.messages.some((message) => message.role === "user" && message.content === "Apply the grill-me skill now.")).toBe(true);
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
    expect(c.state.input).toBe("hi");
    const p = c.submit("hi");
    await new Promise((r) => setTimeout(r, 50));
    await p;
    const kinds = c.state.chat.map((i) => i.kind);
    expect(kinds).toContain("user");
    expect(kinds).toContain("assistant");
    expect(c.state.chat[c.state.chat.length - 1].content).toBe("hi");
    expect(c.messages.some((m) => m.role === "user" && m.content === "hi")).toBe(true);
  });

  it("re-injects current date when the context is stale", async () => {
    const c = new Controller(deps());
    c.envStamp = 0;
    const p = c.submit("hi");
    await new Promise((r) => setTimeout(r, 50));
    await p;
    expect(c.messages.some((m) => m.role === "user" && m.content.startsWith("[context] Date/time:"))).toBe(true);
  });

  it("does not re-inject with a fresh context", async () => {
    const c = new Controller(deps());
    const p = c.submit("hi");
    await new Promise((r) => setTimeout(r, 50));
    await p;
    expect(c.messages.some((m) => m.content.startsWith("[context] Date/time:"))).toBe(false);
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

  it("live tool items appear in chat through bus events", () => {
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

  it("model picker: filters and selects", async () => {
    const d = deps();
    d.registry.registerProvider("r1", d.adapter);
    const c = new Controller(d);
    c.state.modelPicker = { entries: [{ route: "r1", models: ["a", "b", "ab"] }], query: "" };
    c.handleKey({}, "a");
    expect(c.state.modelPicker?.query).toBe("a");
    c.pickModel("r1/a");
    expect(c.state.model).toBe("r1/a");
    expect(c.state.modelPicker).toBeNull();
  });

  it("selecting a model from another provider changes the adapter", async () => {
    const d = deps();
    d.registry.registerProvider("openai", d.adapter);
    d.registry.registerProvider("llama", {
      list_models: async () => ["llama-1"],
      prepare_call: async (o) => o,
      stream: async function* () {
        yield { type: "text", text: "do-llama" };
      },
    });
    const c = new Controller(d);
    await c.submit("/model");
    expect(c.state.modelPicker?.entries).toHaveLength(2);
    c.pickModel("llama/llama-1");
    expect(c.state.model).toBe("llama/llama-1");
    await c.submit("hi");
    expect(c.state.chat[c.state.chat.length - 1].content).toBe("do-llama");
  });

  it("/model opens the picker", async () => {
    const c = new Controller(deps());
    c.setInput("/model");
    await c.submit("/model");
    expect(c.state.modelPicker).not.toBeNull();
  });

  it("/session opens the session list", async () => {
    const c = new Controller(deps());
    await c.submit("/session");
    expect(c.state.sessionList).not.toBeNull();
  });

  it("generates the session title from the first message", async () => {
    const c = new Controller(deps());
    await c.submit("hi");
    expect(c.state.title).toBe("hi");
  });

  it("thinking stream becomes a chat item", async () => {
    const d = deps();
    d.adapter = {
      list_models: async () => ["m1"],
      prepare_call: async (o) => o,
      stream: async function* () {
        yield { type: "reasoning", text: "thinking…" };
        yield { type: "text", text: "hi" };
        yield { type: "finish", finish_reason: "stop" };
      },
    } as ControllerDeps["adapter"];
    const c = new Controller(d);
    await c.submit("hi");
    const t = c.state.chat.find((i) => i.kind === "thinking");
    expect(t?.content).toBe("thinking…");
  });

  it("LLM failure uses the message as the title", async () => {
    const d = deps();
    d.adapter = {
      list_models: async () => ["m1"],
      prepare_call: async (o) => o,
      stream: async function* () {
        throw new Error("boom");
      },
    } as ControllerDeps["adapter"];
    const c = new Controller(d);
    await c.submit("test message");
    expect(c.state.title).toBe("test message");
  });

  it("tab completes/cycles /... suggestions in the input", () => {
    const c = new Controller(deps());
    c.setInput("/se");
    expect(c.state.suggest).toEqual(["/session", "/sessions"]);
    c.handleKey({ tab: true }, "");
    expect(c.state.input).toBe("/session");
    c.handleKey({ tab: true }, "");
    expect(c.state.input).toBe("/sessions");
    c.handleKey({ tab: true }, "");
    expect(c.state.input).toBe("/session");
  });

  it("tab remounts the input (inputKey) to move the cursor to the end; typing does not remount", () => {
    const c = new Controller(deps());
    c.setInput("/se");
    const base = c.state.inputKey;
    c.setInput("/se"); // Typing does not remount.
    expect(c.state.inputKey).toBe(base);
    c.handleKey({ tab: true }, "");
    expect(c.state.inputKey).toBe(base + 1);
  });

  it("tab without a suggestion does not change the input", () => {
    const c = new Controller(deps());
    c.setInput("hi");
    c.handleKey({ tab: true }, "");
    expect(c.state.input).toBe("hi");
  });

  it("/new creates a new session and clears state", async () => {
    const c = new Controller(deps());
    await c.submit("hi");
    await c.submit("/new");
    expect(c.state.chat).toEqual([]);
    expect(c.state.title).toBe("");
    expect(c.messages).toHaveLength(1);
  });

  it("/rename sets the session title", async () => {
    const d = deps();
    const c = new Controller(d);
    await c.submit("/rename fix the build");
    expect(c.state.title).toBe("fix the build");
    const list = Session.list(d.sessionDir);
    expect(list[0]?.title).toBe("fix the build");
  });

  it("/help opens the help panel", async () => {
    const c = new Controller(deps());
    await c.submit("/help");
    expect(c.state.helpOpen).toBe(true);
    c.handleKey({ return: true }, "");
    expect(c.state.helpOpen).toBe(false);
  });

  it("unknown command sets a notice", async () => {
    const c = new Controller(deps());
    await c.submit("/fly");
    expect(c.state.notice).toBe("unknown command: /fly");
  });

  it("esc interrupts an in-progress turn", async () => {
    const c = new Controller(deps());
    const p = c.submit("hi");
    expect(c.state.busy).toBe(true);
    c.handleKey({ escape: true }, "");
    await p;
    expect(c.state.busy).toBe(false);
    expect(c.state.notice).toContain("interrupted");
  });
});
