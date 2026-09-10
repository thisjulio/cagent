import React, { useEffect, useState } from "react";
import { Box, Static, Text, render, useInput } from "ink";
import type { Message, ProviderAdapter, ToolArgs, ToolDefinition } from "@cagent/sdk";
import { loadConfig, type AppConfig } from "./config";
import SelectInput from "ink-select-input";
import TextInput from "ink-text-input";
import Spinner from "ink-spinner";
import { EventBus } from "./events";
import { loadPlugins } from "./loader";
import { runTurn, streamOnce } from "./loop";
import { Registry } from "./registry";
import { buildSystemPrompt } from "./prompt";
import { Session, estimateTokens, serializeMessages } from "./session";
import type { ToolAsk } from "./tools";

export type ChatItem = {
  kind: "user" | "assistant" | "tool" | "meta";
  content: string;
  toolName?: string;
  isError?: boolean;
};

export type ToolLogEntry = {
  tool: string;
  cmd: string;
  output?: string;
  isError?: boolean;
  denied?: boolean;
  running?: boolean;
};

export type UIState = {
  chat: ChatItem[];
  toolLog: ToolLogEntry[];
  model: string;
  provider: string;
  tokens: number;
  busy: boolean;
  input: string;
  notice: string;
  pendingAsk: { tool: string; cmd: string } | null;
  modelPicker: { models: string[]; query: string } | null;
  sessionList: { id: string; updated: string; preview: string }[] | null;
  selectedSession: number;
};

export type InputKey = {
  upArrow?: boolean;
  downArrow?: boolean;
  leftArrow?: boolean;
  rightArrow?: boolean;
  return?: boolean;
  escape?: boolean;
  backspace?: boolean;
  ctrl?: boolean;
  shift?: boolean;
  tab?: boolean;
};

export function fuzzy(models: string[], q: string): string[] {
  if (!q) return models;
  const n = q.toLowerCase();
  return models.filter((m) => {
    const s = m.toLowerCase();
    let i = 0;
    for (const c of s) if (c === n[i]) i++;
    return i === n.length;
  });
}

export interface ControllerDeps {
  config: AppConfig;
  registry: Registry;
  bus: EventBus;
  adapter: ProviderAdapter;
  model: string;
  systemPrompt: string;
  sessionDir?: string;
}

export class Controller {
  state: UIState;
  private messages: Message[];
  private session: Session;
  private deps: ControllerDeps;
  private interrupted = false;
  private askResolver: ((ok: boolean) => void) | null = null;
  bump: () => void = () => {};

  constructor(deps: ControllerDeps) {
    this.deps = deps;
    this.session = new Session(undefined, deps.sessionDir);
    const loaded = this.session.load();
    this.messages = [{ role: "system" as const, content: deps.systemPrompt }, ...loaded.messages];
    const chat: ChatItem[] = loaded.records.map((r) => {
      const p = r.payload as Record<string, unknown>;
      if (r.type === "user") return { kind: "user", content: String(p.content ?? "") };
      if (r.type === "assistant") return { kind: "assistant", content: String(p.content ?? "") };
      if (r.type === "tool") return { kind: "tool", content: String(p.content ?? ""), toolName: r.payload.tool_call_id ? String(r.payload.tool_call_id) : undefined };
      return { kind: "meta", content: "meta" };
    });
    if (loaded.records.length) chat.push({ kind: "meta", content: `resumindo sessão ${this.session.id} (${loaded.messages.length} mensagens)` });
    this.state = {
      chat,
      toolLog: [],
      model: deps.model,
      provider: "",
      tokens: estimateTokens(this.messages),
      busy: false,
      input: "",
      notice: "",
      pendingAsk: null,
      modelPicker: null,
      sessionList: null,
    };
  }

  private lastRunning(): ToolLogEntry | undefined {
    for (let i = this.state.toolLog.length - 1; i >= 0; i--) {
      if (this.state.toolLog[i].running) return this.state.toolLog[i];
    }
    return undefined;
  }

  onToolPre(p: unknown): void {
    const { tool, args } = p as { tool: string; args: ToolArgs };
    const cmd = typeof args.command === "string" ? args.command : JSON.stringify(args);
    this.state.toolLog.push({ tool, cmd, running: true });
    this.bump();
  }

  onToolPost(p: unknown): void {
    const { tool, result, error } = p as { tool: string; result?: { output: string }; error?: string };
    const e = [...this.state.toolLog].reverse().find((t) => t.tool === tool && t.running);
    if (e) {
      e.running = false;
      e.output = error ?? result?.output ?? "";
      e.isError = !!error;
    }
    this.bump();
  }

  onToolDenied(p: unknown): void {
    const { tool, args } = p as { tool: string; args: ToolArgs };
    const cmd = typeof args.command === "string" ? args.command : JSON.stringify(args);
    this.state.toolLog.push({ tool, cmd, denied: true });
    this.bump();
  }

  onToolStream(p: unknown, prefix = ""): void {
    const { tool, chunk } = p as { tool: string; chunk: string };
    const e = this.lastRunning();
    if (e && e.tool === tool) {
      e.output = (e.output ?? "") + prefix + chunk;
      this.bump();
    }
  }

  private interrupt(): void {
    if (this.state.busy) this.interrupted = true;
  }

  async submit(text: string): Promise<void> {
    if (!text || this.state.busy) return;
    this.state.input = "";
    if (text.startsWith("/")) {
      if (text === "/compact") return this.compact();
      if (text === "/sessions") return this.openSessions();
      if (text.startsWith("/model")) return this.openModelPicker();
      this.state.notice = `comando desconhecido: ${text}`;
      this.bump();
      return;
    }
    const s = this.state;
    s.chat.push({ kind: "user", content: text });
    s.busy = true;
    this.interrupted = false;
    this.session.append({ ts: Date.now(), type: "user", payload: { content: text } });
    this.messages.push({ role: "user", content: text });
    this.bump();
    try {
      const turn = await runTurn({
        adapter: this.deps.adapter,
        model: s.model,
        messages: this.messages,
        tools: this.deps.registry.tools(),
        allowlist: this.deps.config.allowlist,
        ask: this.ask,
        bus: this.deps.bus,
        onText: (t) => {
          const last = s.chat[s.chat.length - 1];
          if (last.kind === "assistant") last.content += t;
          else s.chat.push({ kind: "assistant", content: t });
          this.bump();
        },
        interrupted: () => this.interrupted,
      });
      for (const r of turn.records) {
        if (r.role === "assistant") {
          this.session.append({
            ts: Date.now(),
            type: "assistant",
            payload: { content: r.content, ...(r.tool_calls ? { tool_calls: r.tool_calls } : {}) },
          });
        } else {
          this.session.append({ ts: Date.now(), type: "tool", payload: { tool_call_id: r.tool_call_id, content: r.content, isError: r.isError } });
          s.chat.push({ kind: "tool", content: r.content, toolName: r.toolName, isError: r.isError });
        }
      }
      if (turn.interrupted) s.notice = "[interrompido — digite para steer]";
      else s.notice = "";
    } catch (e) {
      s.notice = `erro: ${e instanceof Error ? e.message : String(e)}`;
    }
    s.busy = false;
    s.tokens = estimateTokens(this.messages);
    this.bump();
  }

  ask: ToolAsk = async (tool: ToolDefinition, args: ToolArgs) => {
    if (this.deps.config.permissions === false) return true;
    const cmd = typeof args.command === "string" ? args.command : JSON.stringify(args);
    this.state.pendingAsk = { tool: tool.name, cmd };
    this.bump();
    return new Promise<boolean>((resolve) => {
      this.askResolver = resolve;
    });
  };

  private answerAsk(ok: boolean): void {
    if (!this.askResolver) return;
    this.state.pendingAsk = null;
    const r = this.askResolver;
    this.askResolver = null;
    this.bump();
    r(ok);
  }

  private async openModelPicker(): Promise<void> {
    const models = await this.deps.adapter.list_models();
    this.state.modelPicker = { models, query: "" };
    this.bump();
  }

  pickModel(model: string): void {
    if (!this.state.modelPicker) return;
    this.state.model = model;
    this.state.modelPicker = null;
    this.bump();
  }

  private openSessions(): void {
    this.state.sessionList = Session.list();
    this.bump();
  }

  resumeSession(id: string): void {
    if (!this.state.sessionList) return;
    const s = this.state.sessionList.find((x) => x.id === id);
    if (!s) return;
    const session = new Session(s.id);
    const loaded = session.load();
    this.session = session;
    this.messages = [{ role: "system" as const, content: this.deps.systemPrompt }, ...loaded.messages];
    this.state.chat = loaded.records.map((r) => {
      const p = r.payload as Record<string, unknown>;
      if (r.type === "user") return { kind: "user", content: String(p.content ?? "") };
      if (r.type === "assistant") return { kind: "assistant", content: String(p.content ?? "") };
      if (r.type === "tool") return { kind: "tool", content: String(p.content ?? "") };
      return { kind: "meta", content: "meta" };
    });
    this.state.chat.push({ kind: "meta", content: `restaurado ${s.id}` });
    this.state.sessionList = null;
    this.state.tokens = estimateTokens(this.messages);
    this.bump();
  }

  private async compact(): Promise<void> {
    const s = this.state;
    const threshold = this.deps.config.compact_threshold_tokens ?? 60_000;
    const est = estimateTokens(this.messages);
    if (est < threshold) {
      s.notice = `sem compactação (${est} < ${threshold} tokens)`;
      this.bump();
      return;
    }
    const keep = 10;
    if (this.messages.length <= keep + 1) {
      s.notice = "(pouco para compactar)";
      this.bump();
      return;
    }
    const old = this.messages.slice(1, this.messages.length - keep);
    const { text: summary } = await streamOnce({
      adapter: this.deps.adapter,
      model: s.model,
      messages: [
        {
          role: "system",
          content:
            "Resuma a conversa abaixo em até 5 linhas, preservando decisões, comandos executados e resultados relevantes.",
        },
        { role: "user", content: serializeMessages(old) },
      ],
      tools: [],
    });
    const rest = this.messages.slice(this.messages.length - keep);
    this.messages.length = 1;
    this.messages.push({ role: "user", content: `[resumo da conversa anterior]\n${summary}` }, ...rest);
    this.session.append({ ts: Date.now(), type: "meta", payload: { kind: "compacted", summary } });
    s.chat.push({ kind: "meta", content: `compactado: ${est} → ${estimateTokens(this.messages)} tokens` });
    s.tokens = estimateTokens(this.messages);
    this.bump();
  }

  handleKey(key: InputKey, input: string): void {
    const s = this.state;
    if (s.modelPicker) {
      if (key.escape) s.modelPicker = null;
      else if (input && !/^[1-9]$/.test(input)) s.modelPicker.query += input;
      this.bump();
      return;
    }
    if (s.pendingAsk) {
      if (key.escape) this.answerAsk(false);
      else if (input === "y") this.answerAsk(true);
      else if (input === "n") this.answerAsk(false);
      return;
    }
    if (s.sessionList) {
      if (key.escape) s.sessionList = null;
      return;
    }
    if (key.escape) this.interrupt();
  }

  setInput(v: string): void {
    this.state.input = v;
    this.bump();
  }
}



function ChatItemRow({ it }: { it: ChatItem }) {
  if (it.kind === "user")
    return (
      <Text>
        <Text color="cyan">❯ </Text>
        {it.content}
      </Text>
    );
  if (it.kind === "assistant") return <Text>{it.content || "…"}</Text>;
  if (it.kind === "tool")
    return (
      <Text color={it.isError ? "red" : undefined} dimColor={!it.isError}>
        <Text color={it.isError ? "red" : undefined}>{it.toolName ?? "?"}</Text>
        {it.content.slice(0, 200)}
      </Text>
    );
  return <Text dimColor>{it.content}</Text>;
}

function ModelPicker({ c, p }: { c: Controller; p: { models: string[]; query: string } }) {
  const filtered = fuzzy(p.models, p.query);
  return (
    <Box flexDirection="column">
      <Text dimColor>modelo&gt; {p.query}  (↑↓ · 1-9 · enter · esc)</Text>
      {filtered.length === 0 ? <Text dimColor>(nenhum)</Text> : null}
      <SelectInput
        items={filtered.map((m) => ({ label: m, value: m }))}
        onSelect={(item) => c.pickModel(item.value)}
      />
    </Box>
  );
}

function SessionList({ c, list }: { c: Controller; list: { id: string; updated: string; preview: string }[] }) {
  return (
    <Box flexDirection="column">
      <Text dimColor>sessões  (↑↓ · enter · esc)</Text>
      <SelectInput
        items={list.map((s) => ({
          key: s.id,
          label: `${s.id.slice(0, 8)}  ${s.updated.slice(0, 19)}  ${s.preview.slice(0, 30)}`,
          value: s.id,
        }))}
        onSelect={(item) => c.resumeSession(item.value)}
      />
    </Box>
  );
}

export function App({ c }: { c: Controller }) {
  const [, setV] = useState(0);
  useEffect(() => {
    c.bump = () => setV((v) => v + 1);
  }, [c]);
  useInput((input, key) => c.handleKey(key as InputKey, input));

  const s = c.state;
  const last = s.chat.length - 1;
  return (
    <Box flexDirection="column">
      <Box flexDirection="row">
        <Box flexDirection="column" flexGrow={1}>
          <Static items={s.chat.slice(0, last)}>
            {(it) => <ChatItemRow it={it} />}
          </Static>
          {s.chat.length > 0 ? <ChatItemRow it={s.chat[last]} /> : null}
          <Box>
            {s.modelPicker ? (
              <ModelPicker c={c} p={s.modelPicker} />
            ) : s.sessionList ? (
              <SessionList c={c} list={s.sessionList} />
            ) : s.pendingAsk ? (
              <Text color="yellow">
                → {s.pendingAsk.tool} {s.pendingAsk.cmd}  permitir? (y/n, esc nega)
              </Text>
            ) : (
              <Box flexDirection="row">
                <Text color="cyan">❯ </Text>
                <TextInput
                  value={s.input}
                  onChange={(v: string) => c.setInput(v)}
                  onSubmit={(v: string) => c.submit(v)}
                />
              </Box>
            )}
          </Box>
          {s.notice ? <Text dimColor>{s.notice}</Text> : null}
        </Box>
        <Box width={40} flexDirection="column" borderStyle="round" borderColor="gray">
          <Text bold>tools</Text>
          {s.toolLog.length === 0 ? <Text dimColor>(vazio)</Text> : null}
          {s.toolLog.map((t, i) => (
            <Text key={i} color={t.isError ? "red" : undefined} dimColor={!t.isError}>
              {t.tool} {t.cmd.slice(0, 24)}
              {t.running ? " …" : t.denied ? " (negado)" : ""}
              {t.output ? ` ${t.output.slice(0, 80).replace(/\n/g, " ")}` : ""}
            </Text>
          ))}
        </Box>
      </Box>
      <Box borderTop borderColor="gray">
        {s.busy ? (
          <Text dimColor>
            <Spinner type="dots" /> pensando…
          </Text>
        ) : (
          <Text dimColor>
            {s.provider} | {s.model} | {s.tokens} tokens
          </Text>
        )}
      </Box>
    </Box>
  );
}

export async function bootstrap(): Promise<void> {
  const config = loadConfig(process.cwd());
  const registry = new Registry();
  const bus = new EventBus();
  const { promptSections } = await loadPlugins(config, registry, bus);

  const route = registry.llmRoute();
  if (!route) {
    console.error("(sem provedor — nada a fazer)");
    process.exit(1);
  }
  const adapter = registry.provider(route)!;
  const model = config.model ?? (await adapter.list_models())[0];

  const c = new Controller({
    config,
    registry,
    bus,
    adapter,
    model,
    systemPrompt: buildSystemPrompt(promptSections),
  });
  c.state.provider = route;

  bus.on("tools/pre", (p) => c.onToolPre(p));
  bus.on("tools/post", (p) => c.onToolPost(p));
  bus.on("tools/denied", (p) => c.onToolDenied(p));
  bus.on("tools/stdout", (p) => c.onToolStream(p));
  bus.on("tools/stderr", (p) => c.onToolStream(p, "[stderr] "));

  render(<App c={c} />);
}

// ponytail: model picker com fuzzy por subseqüência; search-and-select completo entra quando os modelos superarem 50
