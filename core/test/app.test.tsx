import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import React from "react";
import { describe, expect, it } from "bun:test";
import { renderToString } from "ink";
import { App, Controller, fuzzy, type ControllerDeps } from "../src/app";
import { EventBus } from "../src/events";
import { Registry } from "../src/registry";

function deps(permissions = false): ControllerDeps {
  return {
    config: { plugins: [], allowlist: [], model: "m1", permissions },
    registry: new Registry(),
    bus: new EventBus(),
    adapter: {
      list_models: async () => ["modelo-a", "modelo-b"],
      prepare_call: async (o) => o,
      stream: async function* () {
        yield { type: "text", text: "oi" };
      },
    },
    model: "m1",
    systemPrompt: "sys",
    sessionDir: fs.mkdtempSync(path.join(os.tmpdir(), "cagent-ui-")),
  };
}

describe("fuzzy", () => {
  const models = ["gpt-5.6-luna", "gpt-5.1", "claude-opus"];
  it("sem query retorna tudo", () => expect(fuzzy(models, "")).toEqual(models));
  it("subsequência casa", () => expect(fuzzy(models, "gl")).toEqual(["gpt-5.6-luna"]));
  it("sem casa vazio", () => expect(fuzzy(models, "zz")).toEqual([]));
  it("case-insensitive", () => expect(fuzzy(models, "OPUS")).toEqual(["claude-opus"]));
});

describe("renderToString", () => {
  it("renderiza panes e status bar", () => {
    const c = new Controller(deps());
    c.state.provider = "openai";
    const out = renderToString(React.createElement(App, { c }));
    expect(out).toContain("m1");
    expect(out).toContain("openai");
    expect(out).toContain("tokens");
    expect(out).toContain("tools");
  });
});

describe("controller", () => {
  it("digita e envia mensagem (usuário entra no contexto)", async () => {
    const c = new Controller(deps());
    c.setInput("oi");
    expect(c.state.input).toBe("oi");
    const p = c.submit("oi");
    await new Promise((r) => setTimeout(r, 50));
    await p;
    const kinds = c.state.chat.map((i) => i.kind);
    expect(kinds).toContain("user");
    expect(kinds).toContain("assistant");
    expect(c.state.chat[c.state.chat.length - 1].content).toBe("oi");
    expect(c.messages.some((m) => m.role === "user" && m.content === "oi")).toBe(true);
  });

  it("pendingAsk: esc nega; answerAsk(true) aprova", async () => {
    const c = new Controller(deps(true));
    const p = c.ask({ name: "bash" }, { command: "ls" });
    expect(c.state.pendingAsk).not.toBeNull();
    c.handleKey({ escape: true }, "");
    await expect(p).resolves.toBe(false);
    const p2 = c.ask({ name: "bash" }, { command: "ls" });
    c.answerAsk(true);
    await expect(p2).resolves.toBe(true);
  });

  it("model picker: filtra e seleciona", async () => {
    const c = new Controller(deps());
    c.state.modelPicker = { models: ["a", "b", "ab"], query: "" };
    c.handleKey({}, "a");
    expect(c.state.modelPicker?.query).toBe("a");
    c.pickModel("a");
    expect(c.state.model).toBe("a");
    expect(c.state.modelPicker).toBeNull();
  });

  it("comando /model abre o picker", async () => {
    const c = new Controller(deps());
    c.setInput("/model");
    await c.submit("/model");
    expect(c.state.modelPicker).not.toBeNull();
  });

  it("esc interrompe turno em andamento", async () => {
    const c = new Controller(deps());
    const p = c.submit("oi");
    expect(c.state.busy).toBe(true);
    c.handleKey({ escape: true }, "");
    await p;
    expect(c.state.busy).toBe(false);
    expect(c.state.notice).toContain("interrompido");
  });
});
