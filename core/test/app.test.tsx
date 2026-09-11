import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import React from "react";
import { describe, expect, it } from "bun:test";
import { renderToString } from "ink";
import { App, Controller, fuzzy, type ControllerDeps } from "../src/app";
import { EventBus } from "../src/events";
import { Registry } from "../src/registry";
import { Session } from "../src/session";

function deps(permissions = false, configOverrides: Record<string, unknown> = {}): ControllerDeps {
  return {
    config: { plugins: [], allowlist: [], model: "m1", permissions, ...configOverrides } as ControllerDeps["config"],
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
    expect(out).toContain("tok");
    expect(out).toContain("%");
  });

  it("markdown em mensagem de assistant concluída", () => {
    const c = new Controller(deps());
    c.state.chat.push({ kind: "assistant", content: "# título\n\n- item 1\n- item 2\n" });
    const out = renderToString(React.createElement(App, { c }));
    expect(out).toContain("título");
    expect(out).toContain("•");
  });

  it("lista numerada renderiza com números e código sem markup cru", () => {
    const c = new Controller(deps());
    c.state.chat.push({
      kind: "assistant",
      content: "1. Crie uma pasta:\n2. Registre:\n\n   ```ts\n   const a = 1;\n   ```",
    });
    const out = renderToString(React.createElement(App, { c }));
    expect(out).toContain("1.");
    expect(out).toContain("2.");
    expect(out).not.toContain("<span");
    expect(out).not.toContain("hljs-");
  });

  it("tool item renderiza com cmd e dica de expandir", () => {
    const c = new Controller(deps());
    c.onToolPre({ tool: "bash", args: { command: "git status" } });
    c.onToolPost({ tool: "bash", result: { output: "linhas\na\nb" } });
    const out = renderToString(React.createElement(App, { c }));
    expect(out).toContain("bash");
    expect(out).toContain("git status");
    expect(out).toContain("ctrl+o");
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

  it("'a' adiciona o comando ao allowlist da sessão", async () => {
    const d = deps(true);
    const c = new Controller(d);
    const p = c.ask({ name: "bash" }, { command: "rm -rf node_modules" });
    c.handleKey({}, "a");
    await expect(p).resolves.toBe(true);
    expect(d.config.allowlist).toContain("rm -rf node_modules");
  });

  it("tool items vivos no chat via eventos do bus", () => {
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

  it("onToolDenied marca item negado", () => {
    const c = new Controller(deps());
    c.onToolDenied({ tool: "bash", args: { command: "rm -rf /" } });
    const last = c.state.chat[c.state.chat.length - 1];
    expect(last.kind).toBe("tool");
    expect(last.denied).toBe(true);
    expect(last.isError).toBe(true);
  });

  it("ctrl+o expande o último tool item", () => {
    const c = new Controller(deps());
    c.onToolPre({ tool: "bash", args: { command: "ls" } });
    c.onToolPost({ tool: "bash", result: { output: "ok" } });
    c.handleKey({ ctrl: true }, "o");
    expect(c.state.chat[c.state.chat.length - 1].expanded).toBe(true);
    c.handleKey({ ctrl: true }, "o");
    expect(c.state.chat[c.state.chat.length - 1].expanded).toBe(false);
  });

  it("model picker: filtra e seleciona", async () => {
    const d = deps();
    d.registry.registerProvider("r1", d.adapter);
    const c = new Controller(d);
    c.state.modelPicker = { entries: [{ route: "r1", models: ["a", "b", "ab"] }], query: "" };
    c.handleKey({}, "a");
    expect(c.state.modelPicker?.query).toBe("a");
    c.pickModel("a");
    expect(c.state.model).toBe("a");
    expect(c.state.provider).toBe("r1");
    expect(c.state.modelPicker).toBeNull();
  });

  it("selecionar modelo de outro provedor troca o adapter", async () => {
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
    c.pickModel("llama-1");
    expect(c.state.provider).toBe("llama");
    expect(c.state.model).toBe("llama-1");
    await c.submit("oi");
    expect(c.state.chat[c.state.chat.length - 1].content).toBe("do-llama");
  });

  it("comando /model abre o picker", async () => {
    const c = new Controller(deps());
    c.setInput("/model");
    await c.submit("/model");
    expect(c.state.modelPicker).not.toBeNull();
  });

  it("/session abre a lista de sessões", async () => {
    const c = new Controller(deps());
    await c.submit("/session");
    expect(c.state.sessionList).not.toBeNull();
  });

  it("gera título da sessão na 1ª mensagem", async () => {
    const c = new Controller(deps());
    await c.submit("oi");
    expect(c.state.title).toBe("oi");
  });

  it("stream de thinking vira item de chat", async () => {
    const d = deps();
    d.adapter = {
      list_models: async () => ["m1"],
      prepare_call: async (o) => o,
      stream: async function* () {
        yield { type: "reasoning", text: "pensando…" };
        yield { type: "text", text: "oi" };
        yield { type: "finish", finish_reason: "stop" };
      },
    } as ControllerDeps["adapter"];
    const c = new Controller(d);
    await c.submit("oi");
    const t = c.state.chat.find((i) => i.kind === "thinking");
    expect(t?.content).toBe("pensando…");
  });

  it("falha no LLM → título é a própria mensagem", async () => {
    const d = deps();
    d.adapter = {
      list_models: async () => ["m1"],
      prepare_call: async (o) => o,
      stream: async function* () {
        throw new Error("boom");
      },
    } as ControllerDeps["adapter"];
    const c = new Controller(d);
    await c.submit("mensagem de teste");
    expect(c.state.title).toBe("mensagem de teste");
  });

  it("/new cria sessão nova e limpa estado", async () => {
    const c = new Controller(deps());
    await c.submit("oi");
    await c.submit("/new");
    expect(c.state.chat).toEqual([]);
    expect(c.state.title).toBe("");
    expect(c.messages).toHaveLength(1);
  });

  it("/rename define o título da sessão", async () => {
    const d = deps();
    const c = new Controller(d);
    await c.submit("/rename fixar o build");
    expect(c.state.title).toBe("fixar o build");
    const list = Session.list(d.sessionDir);
    expect(list[0]?.title).toBe("fixar o build");
  });

  it("comando /help abre o painel de ajuda", async () => {
    const c = new Controller(deps());
    await c.submit("/help");
    expect(c.state.helpOpen).toBe(true);
    c.handleKey({ return: true }, "");
    expect(c.state.helpOpen).toBe(false);
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
