import type { ControllerDeps, UIState } from "./state";
import { Session } from "../session/index";
import { captureProjectMeta, projectMetaRecord } from "../session/project";
import { mergeSystemMessages } from "../message-context";
import { restoreTasks } from "../tasks";
import { QuestionService } from "./question-service";
import { appendChat, MAX_CHAT_ITEMS } from "./chat-buffer";
import { toChatItems, toTitle } from "./sessions";
import { compactionThreshold } from "./compaction-threshold";
import type { Controller } from "./controller";
import { notifyTerminalAttention } from "../terminal-attention";

export interface ControllerRuntime {
  state: UIState;
  messages: import("@cagent/sdk").Message[];
  session: Session;
  adapter: ControllerDeps["adapter"];
  maxTurns?: number;
  maxToolCalls?: number;
  readOnly: boolean;
  onText?: ControllerDeps["onText"];
  onReasoning?: ControllerDeps["onReasoning"];
  onToolEvent?: ControllerDeps["onToolEvent"];
  questionService: QuestionService;
  stableContext: Map<string, import("@cagent/sdk").ContextContribution[]>;
  stableContextSessionId?: string;
  initialize(deps: ControllerDeps): void;
  restoreQueuedMessages(
    messages: readonly import("../session/index").QueueMessage[],
  ): void;
  queuedMessages(): readonly import("../session/index").QueueMessage[];
  bump(): void;
}

export function initializeControllerState(
  controller: ControllerRuntime,
  deps: ControllerDeps,
): void {
  controller.initialize(deps);
  controller.session = new Session(deps.sessionId, deps.sessionDir);
  const loaded = controller.session.load();
  controller.messages = mergeSystemMessages(deps.systemPrompt, loaded.messages);
  controller.restoreQueuedMessages(loaded.queuedMessages);
  const contextWindow = deps.contextWindow ?? 100_000;
  const state: UIState = {
    tasks: restoreTasks(loaded.records),
    chat: toChatItems(loaded.records).slice(-MAX_CHAT_ITEMS),
    chatVersion: 0,
    toolLog: [],
    sessionId: controller.session.id,
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
    lastTurnTokensPerSecond: undefined,
    lastTurnTimeToFirstTokenMs: undefined,
    lastTurnPromptTokensCached: undefined,
    providerUsage: [],
    usageTotals: {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    },
    contextWindow,
    threshold: compactionThreshold(contextWindow, deps.config),
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
    appendChat(state, {
      kind: "meta",
      content: `resuming session ${controller.session.id} (${loaded.messages.length} messages)`,
    });
  if (!loaded.records.length)
    controller.session.append(projectMetaRecord(captureProjectMeta()));
  for (const message of controller.queuedMessages())
    appendChat(state, {
      kind: "user",
      content: message.content,
      queueStatus: message.status,
      turnId: undefined,
    });
  controller.state = state;
  controller.questionService = new QuestionService();
  controller.questionService.onChange(() => {
    const pending = controller.questionService.list();
    controller.state.questionRequest = pending.length > 0 ? pending[0] : null;
    if (controller.state.questionRequest) notifyTerminalAttention();
    if (!controller.state.questionRequest) {
      controller.state.questionIndex = 0;
      controller.state.questionSelectedOption = 0;
      controller.state.questionTextAnswer = "";
      controller.state.questionOtherMode = false;
      controller.state.questionAnswers = [];
      controller.state.questionSelectedOptions = [];
    }
    controller.bump();
  });
}
