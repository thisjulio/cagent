import type { Message, ToolArgs, ToolDefinition, ProviderAdapter } from "@cagent/sdk";
import { runSlash } from "../commands/commands";
import { slashSuggestions } from "../commands/suggest";
import { runTurn } from "../loop";
import { Session, estimateTokens } from "../session";
import { splitRoute } from "../route";
import type { ToolAsk } from "../tools";
import { generateTitle, openSessions, renameSession, startNewSession, restoreSession, toChatItems, toTitle, compact } from "./sessions";
import { openModelPicker, pickModel } from "./models";
import { toolDenied, toolPost, toolPre, toolStream } from "./tool-events";
import { onKey } from "./keys";
import type { ControllerDeps, InputKey, UIState } from "./state";
import { appendChat, MAX_CHAT_ITEMS } from "./chat-buffer";
import { appendCapped, MAX_RESPONSE_CHARS, MAX_VISIBLE_STREAM_CHARS } from "../stream-buffer";

export class Controller {
  state: UIState;
  messages: Message[];
  session: Session;
  adapter: ProviderAdapter;
  bump: () => void = () => {};

  private deps: ControllerDeps;
  private interrupted = false;
  private lastStreamBump = 0;
  envStamp: number = Date.now();
  private askResolver: ((ok: boolean) => void) | null = null;

  constructor(deps: ControllerDeps) {
    this.deps = deps;
    this.adapter = deps.adapter;
    this.session = new Session(undefined, deps.sessionDir);
    const loaded = this.session.load();
    this.messages = [{ role: "system" as const, content: deps.systemPrompt }, ...loaded.messages];
    const s: UIState = {
      chat: toChatItems(loaded.records).slice(-MAX_CHAT_ITEMS),
      chatVersion: 0,
      toolLog: [],
      title: toTitle(loaded.records),
      model: deps.model,
      tokens: this.estimateTokens(),
      contextWindow: deps.contextWindow ?? deps.config.compact_threshold_tokens ?? 60_000,
      threshold: deps.config.compact_threshold_tokens ?? 60_000,
      busy: false,
      input: "",
      notice: "",
      pendingAsk: null,
      modelPicker: null,
      sessionList: null,
      helpOpen: false,
      suggest: [],
      suggestIdx: -1,
      inputKey: 0,
    };
    if (loaded.records.length) appendChat(s, { kind: "meta", content: `resuming session ${this.session.id} (${loaded.messages.length} messages)` });
    this.state = s;
  }

  private estimateTokens(): number {
    return this.adapter.estimate_tokens?.(splitRoute(this.deps.model)[1], this.messages) ?? estimateTokens(this.messages);
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
    this.bumpStream();
  }

  private bumpStream(): void {
    const now = Date.now();
    if (now - this.lastStreamBump < 33) return;
    this.lastStreamBump = now;
    this.bump();
  }

  private maybeEnvContext(): void {
    if (Date.now() - this.envStamp < 30 * 60_000) return;
    // ponytail: 30 minutes between reinjections; lower the interval if multi-hour sessions show staleness.
    this.messages.push({
      role: "user" as const,
      content: `[context] Date/time: ${new Date().toISOString()} (UTC); timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`,
    });
    this.envStamp = Date.now();
  }

  interrupt(): void {
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
    appendChat(s, { kind: "user", content: text });
    s.busy = true;
    this.interrupted = false;
    this.session.append({ ts: Date.now(), type: "user", payload: { content: text } });
    this.messages.push({ role: "user", content: text });
    this.maybeEnvContext();
    if (estimateTokens(this.messages) >= s.threshold) {
      try { await compact(this); } catch (e) { s.notice = `compaction failed: ${e instanceof Error ? e.message : String(e)}`; }
    }
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
          if (last.kind === "assistant") last.content = appendCapped(last.content, t, MAX_VISIBLE_STREAM_CHARS);
          else appendChat(s, { kind: "assistant", content: appendCapped("", t, MAX_VISIBLE_STREAM_CHARS) });
          this.bumpStream();
        },
        onReasoning: (t) => {
          const last = s.chat[s.chat.length - 1];
          if (last.kind === "thinking") last.content = appendCapped(last.content, t, MAX_VISIBLE_STREAM_CHARS);
          else appendChat(s, { kind: "thinking", content: appendCapped("", t, MAX_VISIBLE_STREAM_CHARS) });
          this.bumpStream();
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
      if (turn.inputTokens !== undefined) s.tokens = turn.inputTokens;
      s.notice = turn.interrupted ? "[interrupted - type to steer]" : "";
    } catch (e) {
      s.notice = `error: ${e instanceof Error ? e.message : String(e)}`;
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

  answerAsk(ok: boolean): void {
    if (!this.askResolver) return;
    this.state.pendingAsk = null;
    const r = this.askResolver;
    this.askResolver = null;
    this.bump();
    r(ok);
  }

  allowAlways(): void {
    const s = this.state;
    if (!s.pendingAsk) return;
    const cmd = s.pendingAsk.cmd;
    if (!this.deps.config.allowlist.includes(cmd)) this.deps.config.allowlist.push(cmd);
    // ponytail: allowlist is in memory for the session; config persistence is Phase 7.
    this.answerAsk(true);
  }

  toggleToolExpand(index?: number): void {
    const chat = this.state.chat;
    if (index !== undefined) {
      if (chat[index]?.kind !== "tool") return;
      chat[index] = { ...chat[index], expanded: !chat[index].expanded };
      this.bump();
      return;
    }
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
    onKey(this, key, input);
  }

  setInput(v: string): void {
    const s = this.state;
    s.input = v;
    s.suggest = slashSuggestions(v);
    s.suggestIdx = -1;
    this.bump();
  }
}
