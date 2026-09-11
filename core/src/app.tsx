import React, { useEffect, useState } from "react";
import { Box, Static, Text, render, useInput } from "ink";
import ReactMarkdown from "react-markdown";
import hljs from "highlight.js";
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
  cmd?: string;
  isError?: boolean;
  denied?: boolean;
  running?: boolean;
  expanded?: boolean;
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
  threshold: number;
  busy: boolean;
  input: string;
  notice: string;
  pendingAsk: { tool: string; cmd: string } | null;
  modelPicker: { models: string[]; query: string } | null;
  sessionList: { id: string; updated: string; title: string }[] | null;
  helpOpen: boolean;
  title: string;
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
      if (r.type === "tool") return { kind: "tool", content: String(p.content ?? ""), toolName: p.toolName ? String(p.toolName) : String(p.tool_call_id ?? "") };
      return { kind: "meta", content: "meta" };
    });
    if (loaded.records.length) chat.push({ kind: "meta", content: `resumindo sessão ${this.session.id} (${loaded.messages.length} mensagens)` });
    const titleRec = loaded.records.find((r) => r.type === "meta" && (r.payload as Record<string, unknown>).kind === "title");
    this.state = {
      chat,
      toolLog: [],
      title: titleRec ? String((titleRec.payload as Record<string, unknown>).title ?? "") : "",
      model: deps.model,
      provider: "",
      tokens: estimateTokens(this.messages),
      threshold: deps.config.compact_threshold_tokens ?? 60_000,
      busy: false,
      input: "",
      notice: "",
      pendingAsk: null,
      modelPicker: null,
      sessionList: null,
      helpOpen: false,
    };
  }

  private lastRunningChat(tool: string): ChatItem | undefined {
    const chat = this.state.chat;
    for (let i = chat.length - 1; i >= 0; i--) {
      if (chat[i].kind === "tool" && chat[i].toolName === tool && chat[i].running) return chat[i];
    }
    return undefined;
  }

  onToolPre(p: unknown): void {
    const { tool, args } = p as { tool: string; args: ToolArgs };
    const cmd = typeof args.command === "string" ? args.command : JSON.stringify(args);
    this.state.chat.push({ kind: "tool", toolName: tool, cmd, running: true, content: "" });
    this.state.toolLog.push({ tool, cmd, running: true });
    this.bump();
  }

  onToolPost(p: unknown): void {
    const { tool, result, error } = p as { tool: string; result?: { output: string }; error?: string };
    const e = this.lastRunningChat(tool);
    if (e) {
      e.running = false;
      e.isError = !!error;
      if (!e.content) e.content = error ?? result?.output ?? "";
    }
    const side = [...this.state.toolLog].reverse().find((t) => t.tool === tool && t.running);
    if (side) {
      side.running = false;
      side.output = error ?? result?.output ?? "";
      side.isError = !!error;
    }
    this.bump();
  }

  onToolDenied(p: unknown): void {
    const { tool, args } = p as { tool: string; args: ToolArgs };
    const cmd = typeof args.command === "string" ? args.command : JSON.stringify(args);
    this.state.chat.push({ kind: "tool", toolName: tool, cmd, denied: true, isError: true, running: false, content: "usuário negou" });
    this.state.toolLog.push({ tool, cmd, denied: true });
    this.bump();
  }

  onToolStream(p: unknown, prefix = ""): void {
    const { tool, chunk } = p as { tool: string; chunk: string };
    const e = this.lastRunningChat(tool);
    if (e) {
      e.content = (e.content ?? "") + prefix + chunk;
      this.bump();
    }
    const side = this.lastRunningToolLog(tool);
    if (side) {
      side.output = (side.output ?? "") + prefix + chunk;
      this.bump();
    }
  }

  private lastRunningToolLog(tool: string): ToolLogEntry | undefined {
    const log = this.state.toolLog;
    for (let i = log.length - 1; i >= 0; i--) {
      if (log[i].tool === tool && log[i].running) return log[i];
    }
    return undefined;
  }

  private interrupt(): void {
    if (this.state.busy) this.interrupted = true;
  }

  async submit(text: string): Promise<void> {
    if (!text || this.state.busy) return;
    this.state.input = "";
    if (text.startsWith("/")) {
      if (text === "/compact") return this.compact();
      if (text === "/sessions" || text === "/session") return this.openSessions();
      if (text === "/new") return this.newSession();
      if (text.startsWith("/rename")) return this.renameSession(text.slice("/rename".length).trim());
      if (text.startsWith("/model")) return this.openModelPicker();
      if (text === "/help") {
        this.state.helpOpen = true;
        this.bump();
        return;
      }
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
    if (!s.title) {
      const t = await this.generateTitle(text);
      s.title = t;
      this.session.append({ ts: Date.now(), type: "meta", payload: { kind: "title", title: t } });
    }
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
            payload: { content: r.content, ...(r.tool_calls ? { tool_calls: r.tool_calls} : {}) },
          });
        } else {
          this.session.append({ ts: Date.now(), type: "tool", payload: { tool_call_id: r.tool_call_id, content: r.content, isError: r.isError, toolName: r.toolName } });
        }
      }
      for (const it of s.chat) if (it.kind === "tool" && it.running) it.running = false;
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

  private allowAlways(): void {
    const s = this.state;
    if (!s.pendingAsk) return;
    const cmd = s.pendingAsk.cmd;
    if (!this.deps.config.allowlist.includes(cmd)) this.deps.config.allowlist.push(cmd);
    // ponytail: allowlist em memória (sessão); persistência na config é Fase 7
    this.answerAsk(true);
  }

  toggleToolExpand(): void {
    const chat = this.state.chat;
    for (let i = chat.length - 1; i >= 0; i--) {
      if (chat[i].kind === "tool") {
        chat[i] = { ...chat[i], expanded: !chat[i].expanded };
        this.bump();
        return;
      }
    }
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

  // ponytail: <Static> só acumula itens; limpar o scrollback via escape codes é a única forma de esvaziar a tela
  private clearScrollback(): void {
    if (process.stdout.isTTY) process.stdout.write("\x1b[3J\x1b[2J\x1b[H");
  }

  private newSession(): void {
    this.clearScrollback();
    this.session = new Session(undefined, this.deps.sessionDir);
    this.messages = [{ role: "system" as const, content: this.deps.systemPrompt }];
    this.interrupted = false;
    const s = this.state;
    s.chat = [];
    s.toolLog = [];
    s.title = "";
    s.busy = false;
    s.input = "";
    s.notice = "";
    s.pendingAsk = null;
    s.modelPicker = null;
    s.sessionList = null;
    s.tokens = estimateTokens(this.messages);
    this.bump();
  }

  private renameSession(name: string): void {
    const s = this.state;
    if (!name) {
      s.notice = "uso: /rename <título>";
      this.bump();
      return;
    }
    s.title = name.slice(0, 60);
    this.session.append({ ts: Date.now(), type: "meta", payload: { kind: "title", title: s.title } });
    s.notice = "";
    this.bump();
  }

  private async generateTitle(msg: string): Promise<string> {
    try {
      const { text } = await streamOnce({
        adapter: this.deps.adapter,
        model: this.state.model,
        messages: [
          {
            role: "system",
            content:
              "Gere um título curto (máx. 6 palavras) para a conversa que começa com a mensagem do usuário. Responda apenas com o título, sem aspas.",
          },
          { role: "user", content: msg },
        ],
        tools: [],
        attempts: 1,
        interrupted: () => this.interrupted,
      });
      const t = text.trim().replace(/^["'“”]+|["'“”]+$/g, "").trim();
      if (t) return t.slice(0, 60);
    } catch {
      // fallback: LLM falhou ou o usuário interrompeu
    }
    return msg.length > 40 ? msg.slice(0, 40) + "…" : msg;
  }

  resumeSession(id: string): void {
    if (!this.state.sessionList) return;
    const s = this.state.sessionList.find((x) => x.id === id);
    if (!s) return;
    this.clearScrollback();
    const session = new Session(s.id);
    const loaded = session.load();
    this.session = session;
    this.messages = [{ role: "system" as const, content: this.deps.systemPrompt }, ...loaded.messages];
    this.state.chat = loaded.records.map((r) => {
      const p = r.payload as Record<string, unknown>;
      if (r.type === "user") return { kind: "user", content: String(p.content ?? "") };
      if (r.type === "assistant") return { kind: "assistant", content: String(p.content ?? "") };
      if (r.type === "tool") return { kind: "tool", content: String(p.content ?? ""), toolName: p.toolName ? String(p.toolName) : String(p.tool_call_id ?? "") };
      return { kind: "meta", content: "meta" };
    });
    const titleRec = loaded.records.find((r) => r.type === "meta" && (r.payload as Record<string, unknown>).kind === "title");
    this.state.title = titleRec ? String((titleRec.payload as Record<string, unknown>).title ?? "") : "";
    this.state.chat.push({ kind: "meta", content: `restaurado ${s.id}` });
    this.state.sessionList = null;
    this.state.tokens = estimateTokens(this.messages);
    this.bump();
  }

  private async compact(): Promise<void> {
    const s = this.state;
    const threshold = s.threshold;
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
      else if (input === "a") this.allowAlways();
      return;
    }
    if (s.sessionList) {
      if (key.escape) s.sessionList = null;
      this.bump();
      return;
    }
    if (s.helpOpen) {
      if (key.escape || key.return) s.helpOpen = false;
      this.bump();
      return;
    }
    if (key.ctrl && input === "o") this.toggleToolExpand();
    else if (key.escape) this.interrupt();
  }

  setInput(v: string): void {
    this.state.input = v;
    this.bump();
  }
}

const HL_COLORS: Record<string, string> = {
  "hljs-comment": "gray",
  "hljs-quote": "gray",
  "hljs-keyword": "blue",
  "hljs-string": "green",
  "hljs-number": "yellow",
  "hljs-function": "cyan",
  "hljs-title": "cyan",
  "hljs-attr": "yellow",
  "hljs-params": "cyan",
  "hljs-built_in": "cyan",
  "hljs-type": "cyan",
  "hljs-literal": "yellow",
  "hljs-meta": "gray",
  "hljs-symbol": "yellow",
  "hljs-regex": "red",
  "hljs-link": "cyan",
  "hljs-section": "cyan",
  "hljs-variable": "magenta",
  "hljs-deletion": "red",
  "hljs-addition": "green",
};

function decodeHtml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function HighlightedCode({ code, language }: { code: string; language?: string }) {
  if (!code) return <Text>{""}</Text>;
  let html: string;
  try {
    html =
      language && hljs.getLanguage(language)
        ? hljs.highlight(decodeHtml(code), { language, ignoreIllegals: true }).value
        : hljs.highlightAuto(decodeHtml(code), { ignoreIllegals: true }).value;
  } catch {
    return <Text>{code}</Text>;
  }
  // ponytail: parser com pilha para spans aninhados (hljs-function envolve hljs-params); regex antigo vazava markup cru
  const segs: { text: string; color: string | undefined }[] = [];
  const stack: (string | undefined)[] = [];
  const re = /<span class="([^"]+)">|<\/span>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[1] !== undefined) stack.push(HL_COLORS[m[1].split(" ")[0]]);
    else if (m[0] === "</span>") stack.pop();
    else {
      const text = decodeHtml(m[2]);
      if (!text) continue;
      const color = stack[stack.length - 1];
      const last = segs[segs.length - 1];
      if (last && last.color === color) last.text += text;
      else segs.push({ text, color });
    }
  }
  return <Text>{segs.map((s, i) => <Text key={i} color={s.color}>{s.text}</Text>)}</Text>;
}

function Markdown({ content }: { content: string }) {
  return (
    <Text>
      <ReactMarkdown
        components={{
          code: ({ inline, className, children }) => {
            const code = decodeHtml(String(children ?? "")).replace(/\n$/, "");
            if (inline) return <Text color="yellow">{code}</Text>;
            const language = (className ?? "").replace("language-", "").trim();
            return <HighlightedCode code={code} language={language || undefined} />;
          },
          a: ({ children }) => <Text color="cyan" underline>{children}</Text>,
          strong: ({ children }) => <Text bold>{children}</Text>,
          em: ({ children }) => <Text italic>{children}</Text>,
          del: ({ children }) => <Text dimColor>{children}</Text>,
          h1: ({ children }) => <Text bold>{children}</Text>,
          h2: ({ children }) => <Text bold>{children}</Text>,
          h3: ({ children }) => <Text bold>{children}</Text>,
          ul: ({ children }) => <Text>{children}</Text>,
          // ponytail: children do ol vem como ["\n", <li>, "\n", <li>, ...] — filtra elementos antes do cloneElement
          ol: ({ children }) => (
            <Text>
              {React.Children.toArray(children)
                .filter((c) => React.isValidElement(c))
                .map((child, i) =>
                  React.cloneElement(child as React.ReactElement<Record<string, unknown>>, { number: i + 1 })
                )}
            </Text>
          ),
          li: ({ children, number }: { children: unknown; number?: number }) => (
            <Text>{number ? `  ${number}. ` : "  • "}{children}</Text>
          ),
          blockquote: ({ children }) => <Text dimColor>{"  "}{children}</Text>,
          p: ({ children }) => <Text>{children}</Text>,
          pre: ({ children }) => <Text>{children}</Text>,
          br: () => <Text>{"\n"}</Text>,
          img: ({ alt }) => <Text dimColor>{`[imagem: ${alt ?? ""}]`}</Text>,
        }}
      >
        {content}
      </ReactMarkdown>
    </Text>
  );
}

function ChatItemRow({ it, streaming }: { it: ChatItem; streaming: boolean }) {
  if (it.kind === "user")
    return (
      <Box borderStyle="round" borderColor="cyan" paddingX={1} width="100%">
        <Text>
          <Text color="cyan">❯ </Text>
          {it.content}
        </Text>
      </Box>
    );
  if (it.kind === "assistant")
    return (
      <Box borderStyle="round" borderColor="gray" paddingX={1} width="100%">
        {!streaming && it.content ? <Markdown content={it.content} /> : <Text>{it.content || "…"}</Text>}
      </Box>
    );
  if (it.kind === "tool") {
    const status = it.running ? "⋯" : it.isError ? "✗" : "⏺";
    const color = it.isError ? "red" : it.running ? "yellow" : "green";
    const lines = it.content ? it.content.split("\n").length : 0;
    return (
      <Box borderStyle="round" borderColor={it.isError ? "red" : "gray"} paddingX={1} width="100%" flexDirection="column">
        <Text>
          <Text color={color}>{status} </Text>
          <Text bold>{it.toolName ?? "?"}</Text>
          {it.cmd ? (
            <Text dimColor> · {it.expanded ? it.cmd : it.cmd.length > 40 ? it.cmd.slice(0, 40) + "…" : it.cmd}</Text>
          ) : null}
          {it.running ? <Text color="yellow"> (executando…)</Text> : null}
          {it.denied ? <Text color="yellow"> (negado)</Text> : null}
          {!it.running && !it.denied && !it.expanded && lines > 0 && (
            <Text dimColor> +{lines} linha{lines === 1 ? "" : "s"} (ctrl+o)</Text>
          )}
        </Text>
        {it.expanded && it.content ? (
          <Text color={it.isError ? "red" : undefined} dimColor={!it.isError}>
            {"  " + it.content.replace(/\n/g, "\n  ")}
          </Text>
        ) : null}
      </Box>
    );
  }
  return <Text dimColor>{it.content}</Text>;
}

function HelpBox() {
  return (
    <Box borderStyle="round" borderColor="gray" paddingX={1} flexDirection="column">
      <Text>
        comandos: <Text bold>/model</Text> · <Text bold>/sessions</Text> · <Text bold>/compact</Text> · <Text bold>/new</Text> · <Text bold>/rename</Text> · <Text bold>/help</Text>
      </Text>
      <Text>
        teclas: <Text bold>Esc</Text> interrompe/fecha · <Text bold>ctrl+o</Text> expande o último tool · <Text bold>y/n/a</Text> permite/nega/sempre
      </Text>
    </Box>
  );
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

function SessionList({ c, list }: { c: Controller; list: { id: string; updated: string; title: string }[] }) {
  return (
    <Box flexDirection="column">
      <Text dimColor>sessões  (↑↓ · enter · esc)</Text>
      <SelectInput
        items={list.map((s) => ({
          key: s.id,
          label: `${s.id.slice(0, 8)}  ${s.updated.slice(0, 19)}  ${s.title.slice(0, 30)}`,
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
    const onResize = () => c.bump();
    process.stdout.on("resize", onResize);
    return () => process.stdout.off("resize", onResize);
  }, [c]);
  useInput((input, key) => c.handleKey(key as InputKey, input));

  const s = c.state;
  const last = s.chat.length - 1;
  const pct = s.threshold ? Math.round((s.tokens / s.threshold) * 100) : 0;
  const running = s.toolLog[s.toolLog.length - 1]?.running ? s.toolLog[s.toolLog.length - 1].tool : undefined;
  return (
    <Box flexDirection="column">
      <Box flexDirection="column">
        <Static items={s.chat.slice(0, last)} style={{ width: process.stdout.columns }}>
            {(it, i) => <ChatItemRow it={it} streaming={false} key={`c${i}`} />}
          </Static>
          {s.chat.length > 0 ? <ChatItemRow it={s.chat[last]} streaming={s.busy} /> : null}
          {s.helpOpen ? <HelpBox /> : null}
          {s.modelPicker ? (
            <ModelPicker c={c} p={s.modelPicker} />
          ) : s.sessionList ? (
            <SessionList c={c} list={s.sessionList} />
          ) : s.pendingAsk ? (
            <Box flexDirection="column">
              <Text color="yellow">⚠ {s.pendingAsk.tool}: {s.pendingAsk.cmd}</Text>
              <Text color="yellow">permitir?  y = agora · n = negar · a = sempre este comando</Text>
            </Box>
          ) : (
            <>
              <Text dimColor>{"─".repeat(Math.max(1, process.stdout.columns - 2))}</Text>
              {s.busy ? (
                <Text dimColor>
                  <Spinner type="dots" /> {running ? `usando ${running}…` : "pensando…"}
                </Text>
              ) : null}
              <Box borderStyle="round" borderColor="cyan" paddingX={1} flexDirection="row">
                <Text color="cyan">❯ </Text>
                <TextInput
                  value={s.input}
                  onChange={(v: string) => c.setInput(v)}
                  onSubmit={(v: string) => c.submit(v)}
                />
              </Box>
            </>
          )}
          {s.notice ? <Text dimColor>{s.notice}</Text> : null}
        </Box>
      <Box borderTop borderColor="gray">
        <Text dimColor>
          {(s.title || "nova").slice(0, 30)} | {s.provider} | {s.model} | {s.tokens} tok · {pct}% do contexto · Esc interrompe · /help
        </Text>
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
// ponytail: markdown via react-markdown; renderização plain durante o stream evita flicker com fences incompletos
