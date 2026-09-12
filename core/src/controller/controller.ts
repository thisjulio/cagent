import type { Message, ToolArgs, ToolDefinition, ProviderAdapter } from "@cagent/sdk";
import { runSlash } from "../commands/commands";
import { slashSuggestions } from "../commands/suggest";
import { Session, estimateTokens } from "../session";
import { splitRoute } from "../route";
import type { ToolAsk } from "../tools";
import { generateTitle, openSessions, renameSession, startNewSession, restoreSession, toChatItems, toTitle, compact } from "./sessions";
import { openModelPicker, pickModel } from "./models";
import { toolDenied, toolPost, toolPre, toolStream } from "./tool-events";
import { onKey } from "./keys";
import type { ControllerDeps, InputKey, UIState } from "./state";
import type { SkillActivation } from "../skills/types";
import { formatSkillToolOutput } from "../skills/tool-result";
import { appendChat, MAX_CHAT_ITEMS } from "./chat-buffer";
import { executeTurn } from "./turn";
import { mergeSystemMessages } from "../message-context";
import { addEnvironmentContext } from "./environment";
import { toggleToolExpand as toggleToolExpandAction } from "./chat-actions";
export class Controller {
  state: UIState;
  messages: Message[];
  session: Session;
  adapter: ProviderAdapter;
  bump: () => void = () => {};

  private deps: ControllerDeps;
  private interrupted = false;
  private lastStreamBump = 0;
  private skillCallId = 0;
  envStamp: number = Date.now();
  private askResolver: ((ok: boolean) => void) | null = null;

  constructor(deps: ControllerDeps) {
    this.deps = deps;
    this.adapter = deps.adapter;
    this.session = new Session(undefined, deps.sessionDir);
    const loaded = this.session.load();
    this.messages = mergeSystemMessages(deps.systemPrompt, loaded.messages);
    const contextWindow = deps.contextWindow ?? 60_000;
    const configuredPercent = deps.config.compact_threshold_percent ?? 85;
    const percent = Math.min(100, Math.max(1, configuredPercent));
    const threshold = deps.config.compact_threshold_tokens ?? Math.floor(contextWindow * percent / 100);
    const s: UIState = {
      chat: toChatItems(loaded.records).slice(-MAX_CHAT_ITEMS),
      chatVersion: 0,
      toolLog: [],
      title: toTitle(loaded.records),
      model: deps.model,
      tokens: this.estimateTokens(),
      contextWindow,
      threshold,
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
  async invokeSkill(name: string, args = ""): Promise<boolean> {
    if (!this.deps.invokeSkill) return false;
    let activation: SkillActivation | undefined;
    try {
      activation = await this.deps.invokeSkill(name, args);
    } catch (error) {
      this.state.notice = error instanceof Error ? error.message : String(error);
      this.bump();
      return false;
    }
    if (activation === undefined) return false;
    const activated = this.messages.some((message) => message.content.includes(`<skill_content name="${name}"`) || message.content.includes(`<name>${name}</name>`));
    if (!activated) {
      const id = `skill-${this.session.id}-${this.skillCallId++}`;
      const toolCall = { id, name: "skill", arguments: JSON.stringify({ name }) };
      const output = formatSkillToolOutput(name, activation.directory, activation.content);
      this.messages.push({ role: "assistant", content: "", tool_calls: [toolCall] });
      this.messages.push({ role: "tool", tool_call_id: id, content: output });
      toolPre(this.state, { tool: "skill", args: { name } });
      toolPost(this.state, { tool: "skill", result: { output } });
      this.session.append({
        ts: Date.now(),
        type: "meta",
        payload: { kind: "skill-activated", format: "tool-v1", name, source: "user" },
      });
      this.session.append({
        ts: Date.now(),
        type: "assistant",
        payload: { content: "", tool_calls: [toolCall] },
      });
      this.session.append({
        ts: Date.now(),
        type: "tool",
        payload: { tool_call_id: id, content: output, toolName: "skill" },
      });
    }
    this.state.notice = "";
    this.bump();
    return true;
  }

  reloadSkills(): boolean {
    if (!this.deps.reloadSkills) return false;
    this.deps.reloadSkills();
    this.state.suggest = slashSuggestions(this.state.input, this.deps.skillNames?.() ?? []);
    this.state.suggestIdx = -1;
    return true;
  }

  private estimateTokens(): number {
    return this.adapter.estimate_tokens?.(splitRoute(this.deps.model)[1], this.messages) ?? estimateTokens(this.messages);
  }

  onToolPre(p: unknown): void { toolPre(this.state, p); this.bump(); }

  onToolPost(p: unknown): void { toolPost(this.state, p); this.bump(); }

  onToolDenied(p: unknown): void { toolDenied(this.state, p); this.bump(); }

  onToolStream(p: unknown, prefix = ""): void { toolStream(this.state, p, prefix); this.bumpStream(); }

  private bumpStream(): void {
    const now = Date.now();
    if (now - this.lastStreamBump < 33) return;
    this.lastStreamBump = now;
    this.bump();
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
    this.envStamp = addEnvironmentContext(this.messages, this.envStamp);
    s.tokens = this.estimateTokens();
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
    await Promise.all([executeTurn({
      state: s,
      adapter: this.adapter,
      model: splitRoute(s.model)[1],
      messages: this.messages,
      tools: this.deps.registry.tools(),
      allowlist: this.deps.config.allowlist,
      ask: this.ask,
      bus: this.deps.bus,
      session: this.session,
      interrupted: () => this.interrupted,
      bump: () => this.bump(),
      bumpStream: () => this.bumpStream(),
    }), titlePromise]);
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
    toggleToolExpandAction(this.state, index, () => this.bump());
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
    s.suggest = slashSuggestions(v, this.deps.skillNames?.() ?? []);
    s.suggestIdx = -1;
    this.bump();
  }
}
