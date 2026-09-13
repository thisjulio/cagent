import type { Message, ToolArgs, ToolDefinition, ProviderAdapter } from "@cagent/sdk";
import { runSlash } from "../commands/commands";
import { inputSuggestions } from "../commands/suggest";
import { Session, estimateTokens } from "../session";
import { splitRoute } from "../route";
import type { ToolAsk } from "../tools";
import { generateTitle, openSessions, renameSession, startNewSession, restoreSession, toChatItems, toTitle, compact } from "./sessions";
import { openModelPicker, pickModel } from "./models";
import { toolDenied, toolPost, toolPre, toolStream } from "./tool-events";
import { onKey } from "./keys";
import type { ControllerDeps, InputKey, UIState } from "./state";
import { invokeSkill as invokeSkillAction } from "./skill-actions";
import { appendChat, MAX_CHAT_ITEMS } from "./chat-buffer";
import { executeTurn } from "./turn";
import { parseSubagentMention } from "../subagents/mention";
import { mergeSystemMessages } from "../message-context";
import { addEnvironmentContext } from "./environment";
import { toggleToolExpand as toggleToolExpandAction } from "./chat-actions";
import { restoreTasks } from "../tasks";
import { taskAwareTools, updateTasks as updateTaskState } from "./task-actions";
import type { CustomCommand } from "../commands/types";
import { runToolPipeline } from "../tools";
export class Controller {
  state: UIState;
  messages: Message[];
  session: Session;
  maxTurns?: number;
  maxToolCalls?: number;
  onText?: (text: string) => void;
  onReasoning?: (text: string) => void;
  onToolEvent?: ControllerDeps["onToolEvent"];
  adapter: ProviderAdapter;
  bump: () => void = () => {};
  get registry(): ControllerDeps["registry"] { return this.deps.registry; }
  customCommand(name: string): CustomCommand | undefined { return this.deps.commands?.get(name.slice(1)); }
  nextSkillCallId(): number { return this.skillCallId++; }

  private deps: ControllerDeps;
  private interrupted = false;
  private lastStreamBump = 0;
  private skillCallId = 0;
  private abortController: AbortController | null = null;
  envStamp: number = Date.now();
  private askResolver: ((ok: boolean) => void) | null = null;

  private agentNames(): string[] {
    return this.deps.registry.subagents().map((agent) => agent.name);
  }

  private async submitShell(command: string): Promise<void> {
    const tool = this.deps.registry.tool("bash");
    if (!tool) {
      this.state.notice = "bash tool is not available";
      this.bump();
      return;
    }
    const callId = `input-bash-${Date.now()}-${this.skillCallId++}`;
    const args = { command };
    const s = this.state;
    appendChat(s, { kind: "user", content: `$${command}` });
    s.busy = true;
    s.turnStartedAt = Date.now();
    this.interrupted = false;
    this.abortController = new AbortController();
    this.session.append({ ts: Date.now(), type: "user", payload: { content: `$${command}` } });
    this.messages.push({ role: "user", content: `$${command}` });
    this.messages.push({
      role: "assistant",
      content: "",
      tool_calls: [{ id: callId, name: tool.name, arguments: JSON.stringify(args) }],
    });
    this.bump();
    try {
      const result = await runToolPipeline(
        tool,
        args,
        this.deps.config.allowlist,
        this.ask,
        this.deps.bus,
        this.deps.registry.hooks,
        this.abortController.signal,
      );
      this.messages.push({ role: "tool", tool_call_id: callId, content: result.output });
      this.session.append({
        ts: Date.now(),
        type: "assistant",
        payload: { content: "", tool_calls: [{ id: callId, name: tool.name, arguments: JSON.stringify(args) }] },
      });
      this.session.append({
        ts: Date.now(),
        type: "tool",
        payload: { tool_call_id: callId, content: result.output, isError: result.isError, toolName: tool.name },
      });
    } finally {
      s.busy = false;
      s.turnStartedAt = null;
      this.bump();
    }
  }

  constructor(deps: ControllerDeps) {
    this.deps = deps;
    this.adapter = deps.adapter;
    this.session = new Session(deps.sessionId, deps.sessionDir);
    this.maxTurns = deps.maxTurns;
    this.maxToolCalls = deps.maxToolCalls;
    this.onText = deps.onText;
    this.onReasoning = deps.onReasoning;
    this.onToolEvent = deps.onToolEvent;
    const loaded = this.session.load();
    this.messages = mergeSystemMessages(deps.systemPrompt, loaded.messages);
    const contextWindow = deps.contextWindow ?? 60_000;
    const configuredPercent = deps.config.compact_threshold_percent ?? 85;
    const percent = Math.min(100, Math.max(1, configuredPercent));
    const threshold = deps.config.compact_threshold_tokens ?? Math.floor(contextWindow * percent / 100);
    const s: UIState = {
      tasks: restoreTasks(loaded.records),
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
      turnStartedAt: null,
      elapsedMs: 0,
      lastEscTime: 0,
    };
    if (loaded.records.length) appendChat(s, { kind: "meta", content: `resuming session ${this.session.id} (${loaded.messages.length} messages)` });
    this.state = s;
}
  async invokeSkill(name: string, args = ""): Promise<boolean> {
    if (!this.deps.invokeSkill) return false;
    try {
      const activation = await this.deps.invokeSkill(name, args);
      return invokeSkillAction(this, name, activation);
    } catch (error) {
      this.state.notice = error instanceof Error ? error.message : String(error);
      this.bump();
      return false;
    }
  }

  private async submitSubagent(name: string, task: string, original: string): Promise<void> {
    const s = this.state;
    s.input = "";
    appendChat(s, { kind: "user", content: original });
    this.session.append({ ts: Date.now(), type: "user", payload: { content: original } });
    this.session.append({ ts: Date.now(), type: "meta", payload: { kind: "subagent-start", name } });
    appendChat(s, { kind: "assistant", content: "", subagent: name, subagentHeader: true });
    s.busy = true;
    s.turnStartedAt = Date.now();
    this.bump();
    try {
      if (!this.deps.invokeSubagent) throw new Error("subagent runtime is unavailable");
      const result = await this.deps.invokeSubagent({
        name,
        task,
        context: this.messages.slice(),
      });
      this.messages.push(
        { role: "user", content: original },
        { role: "assistant", content: result },
      );
      appendChat(s, { kind: "assistant", content: result, subagent: name });
      this.session.append({ ts: Date.now(), type: "assistant", payload: { content: result, subagent: name } });
    } catch (error) {
      s.notice = `error: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      s.busy = false;
      s.turnStartedAt = null;
      s.elapsedMs = 0;
      this.bump();
    }
  }

  updateTasks(operation: string, args: Record<string, unknown>): string {
    return updateTaskState(this, operation, args);
  }

  reloadSkills(): boolean {
    if (!this.deps.reloadSkills) return false;
    this.deps.reloadSkills();
    this.state.suggest = inputSuggestions(this.state.input, this.deps.skillNames?.() ?? [], [...(this.deps.commands?.keys() ?? [])], this.agentNames());
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

  forceCancel(): void {
    if (this.state.busy) {
      this.interrupted = true;
      if (this.abortController) {
        this.abortController.abort();
      }
    }
  }

  async submit(text: string): Promise<void> {
    if (!text || this.state.busy) return;
    this.state.input = "";
    if (text.startsWith("$") && text.slice(1).trim()) {
      await this.submitShell(text.slice(1).trim());
      return;
    }
    if (text.startsWith("/")) {
      await runSlash(this, text);
      return;
    }
    const mention = parseSubagentMention(text);
    if (mention && this.deps.registry.subagent(mention.name)) {
      await this.submitSubagent(mention.name, mention.task, text);
      return;
    }
    const s = this.state;
    appendChat(s, { kind: "user", content: text });
    s.busy = true;
    s.turnStartedAt = Date.now();
    s.elapsedMs = 0;
    this.interrupted = false;
    this.abortController = new AbortController();
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
    const timer = setInterval(() => {
      if (!s.turnStartedAt) return;
      s.elapsedMs = Date.now() - s.turnStartedAt;
      this.bump();
    }, 500);
    await Promise.all([executeTurn({
      state: s,
      adapter: this.adapter,
      model: splitRoute(s.model)[1],
      messages: this.messages,
      tools: taskAwareTools(this),
      allowlist: this.deps.config.allowlist,
      ask: this.ask,
      bus: this.deps.bus,
      hooks: this.deps.registry.hooks,
      session: this.session,
      interrupted: () => this.interrupted,
      signal: this.abortController.signal,
      maxTurns: this.maxTurns,
      maxToolCalls: this.maxToolCalls,
      onText: this.onText,
      onReasoning: this.onReasoning,
      bump: () => this.bump(),
      bumpStream: () => this.bumpStream(),
    }), titlePromise]).finally(() => clearInterval(timer));
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

  latestUserMessage(): string | null {
    return Session.latestUserMessage(this.deps.sessionDir);
  }

  setInput(v: string): void {
    const s = this.state;
    s.input = v;
    s.suggest = inputSuggestions(v, this.deps.skillNames?.() ?? [], [...(this.deps.commands?.keys() ?? [])], this.agentNames());
    s.suggestIdx = -1;
    this.bump();
  }
}
