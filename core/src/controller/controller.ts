import type { Message, ToolArgs, ToolDefinition, ProviderAdapter } from "@cagent/sdk";
import { runSlash } from "../commands/commands";
import { inputSuggestions } from "../commands/suggest";
import { Session } from "../session";
import type { ToolAsk } from "../tools";
import { generateTitle, openSessions, renameSession, startNewSession, restoreSession, toChatItems, toTitle, compact } from "./sessions";
import { openModelPicker, pickModel } from "./models";
import { toolDenied, toolPost, toolPre, toolStream } from "./tool-events";
import { onKey } from "./keys";
import type { ControllerDeps, InputKey, UIState } from "./state";
import { invokeSkill as invokeSkillAction } from "./skill-actions";
import { appendChat, MAX_CHAT_ITEMS } from "./chat-buffer";
import { parseSubagentMention } from "../subagents/mention";
import { mergeSystemMessages } from "../message-context";
import { toggleToolExpand as toggleToolExpandAction } from "./chat-actions";
import { restoreTasks } from "../tasks";
import { updateTasks as updateTaskState } from "./task-actions";
import type { CustomCommand } from "../commands/types";
import { submitMessage } from "./submission";
import { submitShell as submitShellAction } from "./shell-submission";
import { submitSubagent as submitSubagentAction } from "./subagent-submission";
import { createStreamThrottle } from "./stream-throttle";
import { estimateForModel } from "./token-estimation";

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
  private skillCallId = 0;
  private abortController: AbortController | null = null;
  private bumpStream: () => void;
  envStamp: number = Date.now();
  private askResolver: ((ok: boolean) => void) | null = null;
  get config(): ControllerDeps["config"] { return this.deps.config; }
  get bus(): ControllerDeps["bus"] { return this.deps.bus; }
  isInterrupted(): boolean { return this.interrupted; }
  get signal(): AbortSignal { return this.abortController?.signal ?? new AbortController().signal; }
  resetTurn(): void { this.interrupted = false; this.abortController = new AbortController(); }
  bumpStreamNow(): void { this.bumpStream(); }
  get invokeSubagent() { return this.deps.invokeSubagent; }

  private agentNames(): string[] {
    return this.deps.registry.subagents().map((agent) => agent.name);
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
    this.bumpStream = createStreamThrottle(() => this.bump());
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

  private estimateTokens(): number {
    return estimateForModel(this.adapter, this.deps.model, this.messages);
  }

  estimateCurrentTokens(): number {
    return estimateForModel(this.adapter, this.state.model, this.messages);
  }

  onToolPre(p: unknown): void { toolPre(this.state, p); this.bump(); }

  onToolPost(p: unknown): void { toolPost(this.state, p); this.bump(); }

  onToolDenied(p: unknown): void { toolDenied(this.state, p); this.bump(); }

  onToolStream(p: unknown, prefix = ""): void { toolStream(this.state, p, prefix); this.bumpStream(); }

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
    this.state.inputKey += 1;
    if (text.startsWith("$") && text.slice(1).trim()) {
      await submitShellAction(this, text.slice(1).trim());
      return;
    }
    if (text.startsWith("/")) {
      await runSlash(this, text);
      return;
    }
    const mention = parseSubagentMention(text);
    if (mention && this.deps.registry.subagent(mention.name)) {
      await submitSubagentAction(this, mention.name, mention.task, text);
      return;
    }
    await submitMessage(this, text);
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

  async reviewMemory(id: string, action: "approve" | "ignore" | "edit"): Promise<void> {
    const tool = this.registry.tool(action === "approve" ? "memory_approve" : action === "ignore" ? "memory_ignore" : "memory_edit");
    if (!tool) return;
    const result = await tool.execute({ id, ...(action === "edit" ? { content: this.state.chat.find((item) => item.memoryId === id)?.content ?? "" } : {}) });
    const item = this.state.chat.find((entry) => entry.memoryId === id);
    if (item && (action === "approve" || action === "ignore")) item.memoryStatus = action === "approve" ? "approved" : "ignored";
    this.state.notice = result.output;
    this.bump();
  }

  toggleMemoryDetails(): void {
    const item = [...this.state.chat].reverse().find((entry) => entry.kind === "memory" && entry.memoryStatus === "pending");
    if (!item) return;
    item.expanded = !item.expanded;
    this.bump();
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

  pickModel(route: string): Promise<void> {
    return pickModel(this, route);
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
    s.suggest = inputSuggestions(v, this.deps.skillNames?.() ?? [], [...(this.deps.commands?.keys() ?? []), ...(this.deps.pluginCommands ?? [])], this.agentNames());
    s.suggestIdx = -1;
    this.bump();
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
}