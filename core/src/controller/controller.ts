import type {
  Message,
  ToolArgs,
  ToolDefinition,
  ProviderAdapter,
} from "@cagent/sdk";
import type { ToolAsk } from "../tools";
import type { CustomCommand } from "../commands/types";
import type { ControllerDeps, InputKey, UIState } from "./state";
import { notifyTerminalAttention } from "../terminal-attention";
import {
  loadPreferences,
  savePreferences,
  MAX_PREFERENCE_LENGTH,
  type UserPreference,
} from "../preferences";
import { generateTitle } from "./sessions";
import {
  compactSession,
  newSession,
  open,
  rename,
  resumeSession,
} from "./session-actions";
import {
  moveModelPicker,
  openModelPicker,
  pickModel,
  selectModelPickerEntry,
} from "./models";
import { toolDenied, toolPost, toolPre, toolStream } from "./tool-events";
import { onKey } from "./keys";
import { detectLspServers } from "../lsp/doctor";
import { invokeSkill as invokeSkillAction } from "./skill-actions";
import { notify } from "./chat-buffer";
import { toggleToolExpand as toggleToolExpandAction } from "./chat-actions";
import { updateTasks as updateTaskState } from "./task-actions";
import { contextContributions as collectContextContributions } from "./context-actions";
import { askTool, isToolReadOnly } from "./permission-actions";
import {
  closeToolViewer as closeToolViewerAction,
  openToolViewer as openToolViewerAction,
} from "./tool-viewer-actions";
import {
  historyEntries as getHistoryEntries,
  latestUserMessage as getLatestUserMessage,
  reloadSkills as reloadSkillsAction,
  setInput as setInputAction,
} from "./input-actions";
import { submitMessage as submitMessageAction } from "./submission";
import { submitShell as submitShellAction } from "./shell-submission";
import { submitSubagent as submitSubagentAction } from "./subagent-submission";
import { submitText } from "./submit-dispatch";
import {
  initializeControllerState,
  type ControllerRuntime,
} from "./controller-initialization";

export class Controller implements ControllerRuntime {
  get state(): UIState {
    return this.runtime.state!;
  }
  set state(value: UIState) {
    this.runtime.state = value;
  }
  get messages(): Message[] {
    return this.runtime.messages!;
  }
  set messages(value: Message[]) {
    this.runtime.messages = value;
  }
  get session(): ControllerRuntime["session"] {
    return this.runtime.session!;
  }
  set session(value: ControllerRuntime["session"]) {
    this.runtime.session = value;
  }
  maxTurns?: number;
  maxToolCalls?: number;
  readOnly = false;
  onText?: (text: string) => void;
  onReasoning?: (text: string) => void;
  onToolEvent?: ControllerDeps["onToolEvent"];
  adapter!: ProviderAdapter;
  private bumpCallback: () => void = () => {};
  get bump(): () => void {
    return this.bumpCallback;
  }
  set bump(callback: () => void) {
    this.bumpCallback = callback;
  }
  private deps!: ControllerDeps;
  private runtime!: {
    state?: UIState;
    messages?: Message[];
    session?: import("../session/index").Session;
    stableContext: Map<string, import("@cagent/sdk").ContextContribution[]>;
    stableContextSessionId?: string;
    questionService: import("./question-service").QuestionService;
    queue: import("../session/index").QueueMessage[];
    abortController?: AbortController | null;
    askResolver?: ((ok: boolean) => void) | null;
    skillCallId?: number;
    bumpStream?: () => void;
    bumpCallback?: () => void;
    envStamp?: number;
  };
  interrupted = false;
  readonly maxPreferenceLength = MAX_PREFERENCE_LENGTH;

  constructor(deps: ControllerDeps) {
    initializeControllerState(this, deps);
  }

  initialize(deps: ControllerDeps): void {
    this.deps = deps;
    this.adapter = deps.adapter;
    this.maxTurns = deps.maxTurns;
    this.maxToolCalls = deps.maxToolCalls;
    this.readOnly =
      deps.permissionMode === "read-only" || deps.readOnly === true;
    this.onText = deps.onText;
    this.onReasoning = deps.onReasoning;
    this.onToolEvent = deps.onToolEvent;
    this.runtime = {
      stableContext: new Map(),
      questionService: undefined!,
      queue: [],
      askResolver: null,
      skillCallId: 0,
      bumpStream: () => {},
      bumpCallback: this.bumpCallback,
      envStamp: Date.now(),
    };
  }

  get registry(): ControllerDeps["registry"] {
    return this.deps.registry;
  }
  get config(): ControllerDeps["config"] {
    return this.deps.config;
  }
  get sessionDir(): string | undefined {
    return this.deps.sessionDir;
  }
  get systemPrompt(): string | undefined {
    return this.deps.systemPrompt;
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
  get contextExtensions() {
    return this.deps.contextExtensions ?? [];
  }
  get contextTokenBudget(): number {
    return this.deps.contextTokenBudget ?? 2000;
  }
  get pluginCommands(): string[] | undefined {
    return this.deps.pluginCommands;
  }
  get pluginCommandSubcommands(): Record<string, string[]> | undefined {
    return this.deps.pluginCommandSubcommands;
  }
  get signal(): AbortSignal {
    return this.runtime.abortController?.signal ?? new AbortController().signal;
  }
  get stableContext(): Map<
    string,
    import("@cagent/sdk").ContextContribution[]
  > {
    return this.runtime.stableContext;
  }
  get stableContextSessionId(): string | undefined {
    return this.runtime.stableContextSessionId;
  }
  set stableContextSessionId(value: string | undefined) {
    this.runtime.stableContextSessionId = value;
  }
  get questionService(): import("./question-service").QuestionService {
    return this.runtime.questionService;
  }
  set questionService(value: import("./question-service").QuestionService) {
    this.runtime.questionService = value;
  }
  get askResolver(): ((ok: boolean) => void) | null {
    return this.runtime.askResolver ?? null;
  }
  set askResolver(value: ((ok: boolean) => void) | null) {
    this.runtime.askResolver = value;
  }
  get envStamp(): number {
    return this.runtime.envStamp ?? Date.now();
  }
  set envStamp(value: number) {
    this.runtime.envStamp = value;
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
  queuedMessages(): readonly import("../session/index").QueueMessage[] {
    return this.runtime.queue;
  }
  enqueueMessage(message: import("../session/index").QueueMessage): void {
    this.runtime.queue = [...this.runtime.queue, message];
  }
  takeQueuedMessages(): import("../session/index").QueueMessage[] {
    const messages = this.runtime.queue.map((message) => ({
      ...message,
      status: "processing" as const,
    }));
    this.runtime.queue = [];
    return messages;
  }
  restoreQueuedMessages(
    messages: readonly import("../session/index").QueueMessage[],
  ): void {
    this.runtime.queue = [...messages, ...this.runtime.queue];
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
  skillNames(): string[] {
    return this.deps.skillNames?.() ?? [];
  }
  skillCommandNames(): string[] {
    return this.skillNames();
  }
  commandNames(): string[] {
    return this.customCommandNames();
  }
  subagentNames(): string[] {
    return this.deps.registry.subagents().map((agent) => agent.name);
  }
  reloadSkillsAction(): boolean {
    if (!this.deps.reloadSkills) return false;
    this.deps.reloadSkills();
    return true;
  }
  nextSkillCallId(): number {
    const id = this.runtime.skillCallId ?? 0;
    this.runtime.skillCallId = id + 1;
    return id;
  }
  notifyPermissionRequest(): void {
    notifyTerminalAttention();
    this.bump();
  }
  setAskResolver(resolve: (ok: boolean) => void): void {
    this.askResolver = resolve;
  }
  refreshProjectContext(): void {
    const next = this.deps.rebuildSystemPrompt?.();
    if (!next || this.messages[0]?.role !== "system") return;
    this.deps.systemPrompt = next;
    this.messages[0] = { role: "system", content: next };
  }
  invalidateStableContext(): void {
    this.stableContext.clear();
  }
  contextContributions(
    query: string,
  ): Promise<
    Array<import("@cagent/sdk").ContextContribution & { phase: string }>
  > {
    return collectContextContributions(this, query);
  }
  isInterrupted(): boolean {
    return this.interrupted;
  }
  resetTurn(): void {
    this.interrupted = false;
    this.runtime.abortController = new AbortController();
  }
  bumpStreamNow(): void {
    this.runtime.bumpStream?.();
  }
  get invokeSubagent() {
    return this.deps.invokeSubagent;
  }
  onToolPre(value: unknown): void {
    toolPre(this.state, value);
    this.bump();
  }
  async detectLspStatus(): Promise<void> {
    this.state.lspServers = await detectLspServers(process.cwd());
    this.bump();
  }
  openToolViewer(
    direction: "forward" | "backward" = "forward",
    turnId?: string,
  ): boolean {
    return openToolViewerAction(this, direction, turnId);
  }
  closeToolViewer(): void {
    closeToolViewerAction(this);
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
  onToolPost(value: unknown): void {
    toolPost(this.state, value);
    this.bump();
  }
  onToolDenied(value: unknown): void {
    toolDenied(this.state, value);
    this.bump();
  }
  onToolStream(value: unknown, prefix = ""): void {
    toolStream(this.state, value, prefix);
    this.runtime.bumpStream?.();
  }
  interrupt(): void {
    if (this.state.busy) this.interrupted = true;
  }
  forceCancel(): void {
    if (!this.state.busy) return;
    this.interrupted = true;
    this.runtime.abortController?.abort();
  }
  async submit(text: string): Promise<void> {
    await submitText(this, text, {
      submitMessage: submitMessageAction,
      submitShell: submitShellAction,
      submitSubagent: submitSubagentAction,
    });
  }
  ask: ToolAsk = (tool: ToolDefinition, args: ToolArgs, title?: string) =>
    askTool(this, tool, args, title);
  isToolReadOnly(tool: ToolDefinition, args: ToolArgs): boolean {
    return isToolReadOnly(tool, args);
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
    const resolve = this.askResolver;
    this.askResolver = null;
    this.bump();
    resolve(ok);
  }
  allowAlways(): void {
    const pending = this.state.pendingAsk;
    if (!pending) return;
    if (!this.deps.config.allowlist.includes(pending.cmd))
      this.deps.config.allowlist.push(pending.cmd);
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
  moveModelPicker(direction: "up" | "down"): void {
    moveModelPicker(this, direction);
  }
  selectModelPickerEntry(): Promise<void> {
    return selectModelPickerEntry(this);
  }
  handleKey(key: InputKey, input: string): void {
    onKey(this, key, input);
  }
  latestUserMessage(): string | null {
    return getLatestUserMessage(this);
  }
  historyEntries(query = ""): string[] {
    return getHistoryEntries(query);
  }
  setInput(value: string): void {
    setInputAction(this, value);
  }
  updateTasks(operation: string, args: Record<string, unknown>): string {
    return updateTaskState(this, operation, args);
  }
  reloadSkills(): boolean {
    return reloadSkillsAction(this);
  }
  async invokeSkill(name: string, args = ""): Promise<boolean> {
    if (!this.deps.invokeSkill) return false;
    try {
      return invokeSkillAction(
        this,
        name,
        await this.deps.invokeSkill(name, args),
      );
    } catch (error) {
      notify(
        this.state,
        error instanceof Error ? error.message : String(error),
      );
      return false;
    }
  }
}
