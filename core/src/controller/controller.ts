import type { Message, ToolArgs, ToolDefinition, ProviderAdapter } from "@cagent/sdk";
import { runSlash } from "../commands/commands";
import { runTurn } from "../loop";
import { Session, estimateTokens } from "../session";
import { splitRoute } from "../route";
import type { ToolAsk } from "../tools";
import { generateTitle, openSessions, renameSession, startNewSession, restoreSession, toChatItems, toTitle, compact } from "./sessions";
import { openModelPicker, pickModel } from "./models";
import { toolDenied, toolPost, toolPre, toolStream } from "./tool-events";
import type { ControllerDeps, InputKey, UIState } from "./state";

export class Controller {
  state: UIState;
  messages: Message[];
  session: Session;
  adapter: ProviderAdapter;
  bump: () => void = () => {};

  private deps: ControllerDeps;
  private interrupted = false;
  private askResolver: ((ok: boolean) => void) | null = null;

  constructor(deps: ControllerDeps) {
    this.deps = deps;
    this.adapter = deps.adapter;
    this.session = new Session(undefined, deps.sessionDir);
    const loaded = this.session.load();
    this.messages = [{ role: "system" as const, content: deps.systemPrompt }, ...loaded.messages];
    const s: UIState = {
      chat: toChatItems(loaded.records),
      toolLog: [],
      title: toTitle(loaded.records),
      model: deps.model,
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
    if (loaded.records.length) s.chat.push({ kind: "meta", content: `resumindo sessão ${this.session.id} (${loaded.messages.length} mensagens)` });
    this.state = s;
  }

  onToolPre(p: unknown): void {
    toolPre(this.state, p);
    this.bump();
  }

  onToolPost(p: unknown): void {
    toolPost(this.state, p);
    this.bump();
  }

  onToolDenied(p: unknown): void {
    toolDenied(this.state, p);
    this.bump();
  }

  onToolStream(p: unknown, prefix = ""): void {
    toolStream(this.state, p, prefix);
    this.bump();
  }

  private interrupt(): void {
    if (this.state.busy) this.interrupted = true;
  }

  async submit(text: string): Promise<void> {
    if (!text || this.state.busy) return;
    this.state.input = "";
    if (text.startsWith("/")) {
      await runSlash(this, text);
      return;
    }
    const s = this.state;
    s.chat.push({ kind: "user", content: text });
    s.busy = true;
    this.interrupted = false;
    this.session.append({ ts: Date.now(), type: "user", payload: { content: text } });
    this.messages.push({ role: "user", content: text });
    this.bump();
    const titlePromise = s.title
      ? Promise.resolve<void>()
      : generateTitle(this, text).then((t) => {
          s.title = t;
          this.session.append({ ts: Date.now(), type: "meta", payload: { kind: "title", title: t } });
          this.bump();
        });
    await Promise.all([this.executeTurn(s), titlePromise]);
  }

  private async executeTurn(s: UIState): Promise<void> {
    try {
      const turn = await runTurn({
        adapter: this.adapter,
        model: splitRoute(s.model)[1],
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
        onReasoning: (t) => {
          const last = s.chat[s.chat.length - 1];
          if (last.kind === "thinking") last.content += t;
          else s.chat.push({ kind: "thinking", content: t });
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
          this.session.append({ ts: Date.now(), type: "tool", payload: { tool_call_id: r.tool_call_id, content: r.content, isError: r.isError, toolName: r.toolName } });
        }
      }
      for (const it of s.chat) if (it.kind === "tool" && it.running) it.running = false;
      s.notice = turn.interrupted ? "[interrompido — digite para steer]" : "";
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

  newSession(): void {
    startNewSession(this);
  }

  resumeSession(id: string): void {
    restoreSession(this, id);
  }

  renameSession(name: string): void {
    renameSession(this, name);
  }

  openSessions(): void {
    openSessions(this);
  }

  compact(): Promise<void> {
    return compact(this);
  }

  openModelPicker(): Promise<void> {
    return openModelPicker(this);
  }

  pickModel(route: string): void {
    pickModel(this, route);
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
