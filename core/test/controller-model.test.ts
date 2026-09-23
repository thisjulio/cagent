import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "bun:test";

import { EventBus } from "../src/events";
import { Registry } from "../src/registry";
import { Session } from "../src/session/index";
import { Controller, type ControllerDeps } from "../src/controller/controller";
import { sanitizeTitle } from "../src/controller/sessions";
import { initializeModel } from "../src/controller/models";
import { savePreferences } from "../src/preferences";
import type { Message } from "@cagent/sdk";

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

describe("controller model and commands", () => {
  it("model picker: filters and selects", async () => {
    const d = deps();
    d.adapter.prepare_call = async (request) => request;
    d.registry.registerProvider("r1", d.adapter);
    const c = new Controller(d);
    c.state.modelPicker = {
      entries: [{ route: "r1", models: ["a", "b", "ab"] }],
      query: "",
    };
    c.handleKey({}, "a");
    expect(c.state.modelPicker?.query).toBe("a");
    c.pickModel("r1/a");
    expect(c.state.model).toBe("r1/a");
    expect(c.state.modelPicker).toBeNull();
  });

  it("restores each session's model variant when switching sessions", async () => {
    const d = deps();
    d.registry.registerProvider("openai", d.adapter);
    const c = new Controller(d);

    await c.submit("/variant high");
    const first = c.session.id;
    await c.submit("oi");
    await c.submit("/new");
    await c.submit("/variant medium");
    await c.submit("hello");
    const second = c.session.id;

    c.state.sessionList = Session.list(d.sessionDir);
    await c.resumeSession(first);
    expect(c.state.variant).toBe("high");
    expect(c.state.model).toBe("openai/m1");

    c.state.sessionList = Session.list(d.sessionDir);
    await c.resumeSession(second);
    expect(c.state.variant).toBe("medium");
  });

  it("clears the variant when selecting a model via UI", async () => {
    const d = deps();
    d.registry.registerProvider("openai", d.adapter);
    const c = new Controller(d);
    c.state.modelPicker = {
      entries: [{ route: "openai", models: ["model-a"] }],
      query: "",
    };
    c.state.variant = "fast";

    await c.pickModel("openai/model-a");

    expect(c.state.variant).toBeUndefined();
  });

  it("restores the persisted choice instead of the configured model", async () => {
    const d = deps();
    d.registry.registerProvider("openai", d.adapter);
    const c = new Controller(d);
    c.session.appendModelSelection({
      model: "openai/model-b",
      variant: "balanced",
    });

    await initializeModel(c, "openai/model-a");

    expect(c.state.model).toBe("openai/model-b");
    expect(c.state.variant).toBe("balanced");
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

  it("recalculates the compaction threshold when selecting a model with another context window", async () => {
    const d = deps();
    d.contextWindow = 100_000;
    d.registry.registerProvider("openai", d.adapter);
    d.registry.registerProvider("llama", {
      list_models: async () => ["llama-1"],
      context_window: async () => 50_000,
      prepare_call: async (o) => o,
      stream: async function* () {
        yield { type: "text", text: "do-llama" };
      },
    });
    const c = new Controller(d);
    c.state.modelPicker = {
      entries: [{ route: "llama", models: ["llama-1"] }],
      query: "",
    };

    await c.pickModel("llama/llama-1");

    expect(c.state.contextWindow).toBe(50_000);
    expect(c.state.threshold).toBe(40_000);
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
    expect(sanitizeTitle("**Plan**: `renew catalog`")).toBe(
      "Plan: renew catalog",
    );
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
    const previousSessionId = c.state.sessionId;
    await c.submit("hi");
    await c.submit("/new");
    expect(c.state.chat).toEqual([]);
    expect(c.state.title).toBe("");
    expect(c.messages).toHaveLength(1);
    expect(c.state.sessionId).toBe(c.session.id);
    expect(c.state.sessionId).not.toBe(previousSessionId);
  });

  it("/rename sets the session title", async () => {
    const d = deps();
    const c = new Controller(d);
    await c.submit("initial message");
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

  it("includes user preferences in the title generation prompt", async () => {
    const prefFile = path.join(os.homedir(), ".cagent", "config.yml");
    const original = fs.existsSync(prefFile)
      ? fs.readFileSync(prefFile, "utf8")
      : null;
    fs.mkdirSync(path.dirname(prefFile), { recursive: true });
    savePreferences(
      [{ id: 999, text: "Responda sempre em português", enabled: true }],
      prefFile,
    );

    try {
      const d = deps();
      let capturedMessages: Message[] = [];
      d.adapter = {
        list_models: async () => ["model-a"],
        prepare_call: async (o) => {
          if (
            o.messages.some((message) =>
              String(message.content).includes("You are a title generator"),
            )
          ) {
            capturedMessages = o.messages;
          }
          return o;
        },
        stream: async function* () {
          yield { type: "text", text: "Título da Sessão" };
          yield { type: "finish", finish_reason: "stop" };
        },
      } as ControllerDeps["adapter"];
      d.registry.registerProvider("openai", d.adapter);

      const c = new Controller(d);
      await c.submit("olá, como vai?");

      expect(capturedMessages.length).toBeGreaterThanOrEqual(3);
      expect(capturedMessages[0].role).toBe("system");
      expect(String(capturedMessages[0].content)).toContain(
        "Responda sempre em português",
      );
      expect(String(capturedMessages[1].content)).toContain(
        "Follow all active persistent user preferences",
      );
    } finally {
      if (original !== null) fs.writeFileSync(prefFile, original);
      else if (fs.existsSync(prefFile)) fs.unlinkSync(prefFile);
    }
  });
});
