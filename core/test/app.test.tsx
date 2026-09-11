import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import React from "react";
import { describe, expect, it } from "bun:test";
import { renderToString } from "ink";
import { App } from "../src/ui/components/App";
import { EventBus } from "../src/events";
import { Registry } from "../src/registry";
import { Controller, type ControllerDeps } from "../src/controller/controller";

function deps(): ControllerDeps {
  return {
    config: { plugins: [], allowlist: [], model: "openai/m1", permissions: false } as ControllerDeps["config"],
    registry: new Registry(),
    bus: new EventBus(),
    adapter: {
      list_models: async () => ["modelo-a", "modelo-b"],
      prepare_call: async (o) => o,
      stream: async function* () {
        yield { type: "text", text: "oi" };
      },
    },
    model: "openai/m1",
    systemPrompt: "sys",
    sessionDir: fs.mkdtempSync(path.join(os.tmpdir(), "cagent-ui-")),
  };
}

describe("renderToString", () => {
  it("renderiza panes e status bar", () => {
    const c = new Controller(deps());
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
