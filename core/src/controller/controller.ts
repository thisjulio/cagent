import { orderContextExtensions } from "@cagent/sdk";
import type {
  ContextExtension,
  ContextContribution,
  Message,
  ToolArgs,
  ToolDefinition,
  ProviderAdapter,
} from "@cagent/sdk";
import crypto from "node:crypto";
import { QuestionService } from "./question-service";
import { runSlash } from "../commands/commands";
import { inputSuggestions } from "../commands/suggest";
import { fuzzyProjectFiles } from "../context/file-mentions";
import { Session, type QueueMessage } from "../session/index";
import { captureProjectMeta, projectMetaRecord } from "../session/project";
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
import { loadHistory, searchHistory } from "../session/history";
import type { ControllerDeps, InputKey, UIState } from "./state";
import { detectLspServers } from "../lsp/doctor";
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
  readOnly: boolean;
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
  customCommandNames(): string[] {
    return [...(this.deps.commands?.keys() ?? [])];
  }
  pluginCommandNames(): string[] {
    return this.deps.registry.commands().map((command) => command.name);
  }
  skillCommandNames(): string[] {
    return this.deps.skillNames?.() ?? [];
  }
  subagentNames(): string[] {
    return this.agentNames();
  }
  openCommandPalette(): void {
    this.state.commandPaletteOpen = true;
    this.state.commandPaletteQuery = "";
    this.state.commandPaletteIndex = 0;
    this.bump();
  }
  closeCommandPalette(): void {
    this.state.commandPaletteOpen = false;
    this.state.commandPaletteQuery = "";
    this.state.commandPaletteIndex = 0;
    this.bump();
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
  private stableContext = new Map<string, ContextContribution[]>();
  private stableContextSessionId?: string;
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
  refreshProjectContext(): void {
    const next = this.deps.rebuildSystemPrompt?.();
    if (!next || this.messages[0]?.role !== "system") return;
    this.deps.systemPrompt = next;
    this.messages[0] = { role: "system", content: next };
  }
  get observability(): ControllerDeps["observability"] {
    return this.deps.observability;
  }
  get verification(): ControllerDeps["verification"] {
    return this.deps.verification;
  }
  invalidateStableContext(): void {
    this.stableContext.clear();
  }
  async contextContributions(
    query: string,
  ): Promise<Array<ContextContribution & { phase: string }>> {
    if (this.stableContextSessionId !== this.session.id) {
      this.stableContext.clear();
      this.stableContextSessionId = this.session.id;
    }
    const extensions = this.deps.contextExtensions ?? [];
    let remaining = Math.max(0, this.deps.contextTokenBudget ?? 2000);
    const contributions: Array<ContextContribution & { phase: string }> = [];
    const ordered = orderContextExtensions(extensions);
    for (const extension of ordered) {
      try {
        let entries: ContextContribution[] = [];
        if (extension.phase === "stable") {
          entries = this.stableContext.get(extension.id) ?? [];
          if (!this.stableContext.has(extension.id)) {
            const contribution = await this.contributeWithTimeout(
              extension,
              query,
              remaining,
            );
            if (contribution) entries = [contribution];
            this.stableContext.set(extension.id, entries);
          }
        } else {
          const contribution = await this.contributeWithTimeout(
            extension,
            query,
            remaining,
          );
          if (contribution) entries = [contribution];
        }
        for (const entry of entries) {
          const tokens = Math.max(
            0,
            entry.estimatedTokens ?? Math.ceil(entry.content.length / 4),
          );
          if (tokens > remaining) continue;
          remaining -= tokens;
          contributions.push({ ...entry, phase: extension.phase });
        }
      } catch (error) {
        this.observability?.recordEvent("context.extension.error", {
          "extension.id": extension.id,
          error: String(error),
        });
      }
    }
    return contributions;
  }
  private async contributeWithTimeout(
    extension: ContextExtension,
    query: string,
    tokenBudget: number,
  ): Promise<ContextContribution | void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        extension.contribute({
          query,
          sessionId: this.session.id,
          tokenBudget,
          signal: this.signal,
        }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("extension timed out")),
            250,
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
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
    this.readOnly =
      deps.permissionMode === "read-only" || deps.readOnly === true;
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
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      providerUsage: [],
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
      sessionAll: [],
      sessionScope: "project",
      sessionQuery: "",
      historySearch: false,
      historyIdx: -1,
      historyEntries: [],
      helpOpen: false,
      commandPaletteOpen: false,
      commandPaletteQuery: "",
      commandPaletteIndex: 0,
      infoPanel: null,
      lspPanel: false,
      lspServers: [],
      toolViewerIndex: null,
      permissionMode:
        deps.permissionMode ?? (deps.readOnly ? "read-only" : "ask"),
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
    if (!loaded.records.length)
      this.session.append(projectMetaRecord(captureProjectMeta()));
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

  async detectLspStatus(): Promise<void> {
    this.state.lspServers = await detectLspServers(process.cwd());
    this.bump();
  }

  openToolViewer(direction: "forward" | "backward" = "forward"): boolean {
    const tools = this.state.chat.filter(
      (item) =>
        item.kind === "tool" && !item.running && item.changesWorkspace === true,
    );
    if (!tools.length) {
      notify(this.state, "no file changes yet");
      return false;
    }
    const index =
      this.state.toolViewerIndex === null
        ? tools.length - 1
        : direction === "forward"
          ? (this.state.toolViewerIndex - 1 + tools.length) % tools.length
          : (this.state.toolViewerIndex + 1) % tools.length;
    this.state.toolViewerIndex = index;
    const item = tools[index];
    this.observability?.recordEvent("tool.diff_viewed", {
      index,
      "tool.name": item.toolName ?? "unknown",
      session_id: this.state.sessionId,
    });
    this.bump();
    return true;
  }

  getTelemetrySummary(): NonNullable<UIState["telemetrySummary"]> | undefined {
    const telemetry = this.observability as typeof this.observability & {
      summary?: (sessionId: string) => NonNullable<UIState["telemetrySummary"]>;
    };
    return telemetry?.summary?.(this.session.id);
  }

  async openLspDoctor(): Promise<void> {
    this.observability?.recordEvent("command.executed", {
      "command.name": "/lsp",
      "command.known": true,
      session_id: this.state.sessionId,
    });
    this.state.lspPanel = true;
    this.bump();
    this.state.lspServers = await detectLspServers(process.cwd());
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
    if (
      this.state.permissionMode === "read-only" &&
      !this.isToolReadOnly(tool, args)
    ) {
      this.state.chat.push({
        kind: "meta",
        content: "permission denied: read-only mode (Ctrl+M to switch)",
      });
      this.bump();
      return false;
    }
    if (this.state.permissionMode === "read-only") return true;
    if (this.state.permissionMode === "auto") return true;
    if (this.deps.config.permissions === false) return true;
    const cmd =
      typeof args.command === "string" ? args.command : JSON.stringify(args);
    this.state.pendingAsk = { tool: tool.name, cmd };
    this.bump();
    return new Promise<boolean>((resolve) => {
      this.askResolver = resolve;
    });
  };

  isToolReadOnly(tool: ToolDefinition, args: ToolArgs): boolean {
    if (tool.readOnly) return true;
    if (tool.name !== "bash") return false;
    const command = typeof args.command === "string" ? args.command.trim() : "";
    return /^(ls|pwd|cat|head|tail|grep|rg|find|git\s+(status|diff|log|show|branch)|which|command\s+-v)(\s|$)/.test(
      command,
    );
  }

  cyclePermissionMode(): void {
    const modes = ["ask", "auto", "read-only"] as const;
    const from = this.state.permissionMode;
    const to = modes[(modes.indexOf(from) + 1) % modes.length];
    this.state.permissionMode = to;
    this.observability?.recordEvent("permission.mode_changed", { from, to });
    this.bump();
  }

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
    const message = [...this.messages]
      .reverse()
      .find((entry) => entry.role === "user");
    if (message && typeof message.content === "string") return message.content;
    return null;
  }

  historyEntries(query = ""): string[] {
    return searchHistory(process.cwd(), query).map((entry) => entry.text);
  }

  setInput(v: string): void {
    const s = this.state;
    s.input = v;
    const mention = v.match(/(?:^|\s)@([^\s]*)$/);
    s.suggest = inputSuggestions(
      v,
      this.deps.skillNames?.() ?? [],
      [
        ...(this.deps.commands?.keys() ?? []),
        ...(this.deps.pluginCommands ?? []),
      ],
      this.agentNames(),
      this.deps.pluginCommandSubcommands,
      mention ? fuzzyProjectFiles(mention[1]) : [],
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
      (() => {
        const mention = this.state.input.match(/(?:^|\s)@([^\s]*)$/);
        return mention ? fuzzyProjectFiles(mention[1]) : [];
      })(),
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
