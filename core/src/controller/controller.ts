import type {
  Message,
  ToolArgs,
  ToolDefinition,
  ProviderAdapter,
} from "@cagent/sdk";
import crypto from "node:crypto";
import { QuestionService } from "./question-service";
import { runSlash } from "../commands/commands";
import { inputSuggestions } from "../commands/suggest";
import { Session, type QueueMessage } from "../session/index";
import type { ToolAsk } from "../tools";
import { generateTitle, toChatItems, toTitle } from "./sessions";
import {
  compactSession,
  newSession,
  open,
  rename,
  resumeSession,
} from "./session-actions";
import { openModelPicker, pickModel } from "./models";
import { toolDenied, toolPost, toolPre, toolStream } from "./tool-events";
import { onKey } from "./keys";
import type { ControllerDeps, InputKey, UIState } from "./state";
import { invokeSkill as invokeSkillAction } from "./skill-actions";
import { appendChat, MAX_CHAT_ITEMS, notify } from "./chat-buffer";
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
import { compactionThreshold } from "./compaction-threshold";
import { createQueue, enqueueMessage } from "./message-queue";
import {
  loadPreferences,
  savePreferences,
  MAX_PREFERENCE_LENGTH,
  type UserPreference,
} from "../preferences";

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
  get registry(): ControllerDeps["registry"] {
    return this.deps.registry;
  }
  preferences(): UserPreference[] {
    return loadPreferences();
  }
  updatePreferences(
    mutator: (preferences: UserPreference[]) => string,
  ): string {
    const preferences = loadPreferences();
    const result = mutator(preferences);
    if (!result.startsWith("error:")) savePreferences(preferences);
    return result;
  }
  static readonly maxPreferenceLength = MAX_PREFERENCE_LENGTH;

  queuedMessages(): readonly QueueMessage[] {
    return this.queue;
  }

  takeQueuedMessages(): QueueMessage[] {
    const messages = this.queue.map((message) => ({
      ...message,
      status: "processing" as const,
    }));
    this.queue = [];
    return messages;
  }

  restoreQueuedMessages(messages: readonly QueueMessage[]): void {
    this.queue = [...messages, ...this.queue];
  }

  removeQueuedChatMessage(id: string): void {
    const index = this.state.chat.findIndex(
      (item) => item.kind === "user" && item.queueMessageId === id,
    );
    if (index === -1) return;
    this.state.chat.splice(index, 1);
    this.state.chatVersion += 1;
  }
  customCommand(name: string): CustomCommand | undefined {
    return this.deps.commands?.get(name.slice(1));
  }
  nextSkillCallId(): number {
    return this.skillCallId++;
  }

  private deps: ControllerDeps;
  interrupted = false;
  private skillCallId = 0;
  private abortController: AbortController | null = null;
  private bumpStream: () => void;
  envStamp: number = Date.now();
  private askResolver: ((ok: boolean) => void) | null = null;
  private queue: QueueMessage[] = createQueue();
  questionService: QuestionService;
  get config(): ControllerDeps["config"] {
    return this.deps.config;
  }
  get sessionDir(): string | undefined {
    return this.deps.sessionDir;
  }
  get systemPrompt(): string | undefined {
    return this.deps.systemPrompt;
  }
  get modelChoiceFile(): string | undefined {
    return this.deps.modelChoiceFile;
  }
  get observability(): ControllerDeps["observability"] {
    return this.deps.observability;
  }
  get verification(): ControllerDeps["verification"] {
    return this.deps.verification;
  }
  get bus(): ControllerDeps["bus"] {
    return this.deps.bus;
  }
  isInterrupted(): boolean {
    return this.interrupted;
  }
  get signal(): AbortSignal {
    return this.abortController?.signal ?? new AbortController().signal;
  }
  resetTurn(): void {
    this.interrupted = false;
    this.abortController = new AbortController();
  }
  bumpStreamNow(): void {
    this.bumpStream();
  }
  get invokeSubagent() {
    return this.deps.invokeSubagent;
  }

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
    this.queue = loaded.queuedMessages;
    const contextWindow = deps.contextWindow ?? 100_000;
    const threshold = compactionThreshold(contextWindow, deps.config);
    const s: UIState = {
      tasks: restoreTasks(loaded.records),
      chat: toChatItems(loaded.records).slice(-MAX_CHAT_ITEMS),
      chatVersion: 0,
      toolLog: [],
      sessionId: this.session.id,
      title: toTitle(loaded.records),
      model: loaded.modelSelection?.model ?? deps.model,
      variant: loaded.modelSelection
        ? loaded.modelSelection.variant
        : deps.variant,
      tokens: undefined,
      inputTokens: undefined,
      outputTokens: undefined,
      contextWindow,
      threshold,
      busy: false,
      input: "",
      notice: "",
      compacting: false,
      pendingAsk: null,
      questionRequest: null,
      questionIndex: 0,
      questionSelectedOption: 0,
      questionTextAnswer: "",
      questionOtherMode: false,
      questionAnswers: [],
      questionSelectedOptions: [],
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
    if (loaded.records.length)
      appendChat(s, {
        kind: "meta",
        content: `resuming session ${this.session.id} (${loaded.messages.length} messages)`,
      });
    for (const message of this.queue)
      appendChat(s, {
        kind: "user",
        content: message.content,
        queueStatus: message.status,
        turnId: undefined,
      });
    this.state = s;
    this.questionService = new QuestionService();
    this.questionService.onChange(() => {
      const pending = this.questionService.list();
      this.state.questionRequest = pending.length > 0 ? pending[0] : null;
      if (!this.state.questionRequest) {
        this.state.questionIndex = 0;
        this.state.questionSelectedOption = 0;
        this.state.questionTextAnswer = "";
        this.state.questionOtherMode = false;
        this.state.questionAnswers = [];
        this.state.questionSelectedOptions = [];
      }
      this.bump();
    });
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
    if (!text || !this.state.model) return;
    if (this.state.busy) {
      const message = {
        id: crypto.randomUUID(),
        content: text,
        submittedAt: Date.now(),
      };
      const nextQueue = enqueueMessage(this.queue, message);
      if (nextQueue.length === this.queue.length) {
        notify(this.state, "queued input limit reached");
        return;
      }
      this.queue = nextQueue;
      this.state.input = "";
      this.state.inputKey += 1;
      this.session.append({
        ts: message.submittedAt,
        turnId: this.state.currentTurnId,
        type: "meta",
        payload: { kind: "queued-message", ...message, status: "queued" },
      });
      appendChat(this.state, {
        kind: "user",
        content: text,
        queueStatus: "queued",
        queueMessageId: message.id,
        turnId: this.state.currentTurnId,
      });
      this.bump();
      return;
    }
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
    const cmd =
      typeof args.command === "string" ? args.command : JSON.stringify(args);
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
    if (!this.deps.config.allowlist.includes(cmd))
      this.deps.config.allowlist.push(cmd);
    // ponytail: allowlist is in memory for the session; config persistence is Phase 7.
    this.answerAsk(true);
  }

  toggleToolExpand(index?: number): void {
    toggleToolExpandAction(this.state, index, () => this.bump());
  }

  newSession(): void {
    newSession(this);
  }

  resumeSession(id: string): Promise<void> {
    return resumeSession(this, id);
  }

  renameSession(name: string): void {
    rename(this, name);
  }

  openSessions(): void {
    open(this);
  }

  compact(instructions?: string): Promise<void> {
    return compactSession(this, instructions);
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
    s.suggest = inputSuggestions(
      v,
      this.deps.skillNames?.() ?? [],
      [
        ...(this.deps.commands?.keys() ?? []),
        ...(this.deps.pluginCommands ?? []),
      ],
      this.agentNames(),
      this.deps.pluginCommandSubcommands,
    );
    s.suggestIdx = -1;
    this.bump();
  }

  updateTasks(operation: string, args: Record<string, unknown>): string {
    return updateTaskState(this, operation, args);
  }

  reloadSkills(): boolean {
    if (!this.deps.reloadSkills) return false;
    this.deps.reloadSkills();
    this.state.suggest = inputSuggestions(
      this.state.input,
      this.deps.skillNames?.() ?? [],
      [
        ...(this.deps.commands?.keys() ?? []),
        ...(this.deps.pluginCommands ?? []),
      ],
      this.agentNames(),
      this.deps.pluginCommandSubcommands,
    );
    this.state.suggestIdx = -1;
    return true;
  }

  async invokeSkill(name: string, args = ""): Promise<boolean> {
    if (!this.deps.invokeSkill) return false;
    try {
      const activation = await this.deps.invokeSkill(name, args);
      return invokeSkillAction(this, name, activation);
    } catch (error) {
      notify(
        this.state,
        error instanceof Error ? error.message : String(error),
      );
      return false;
    }
  }
}
