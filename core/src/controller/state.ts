import type {
  ContextExtension,
  Observability,
  ProviderAdapter,
  ToolArgs,
  ToolDisplay,
} from "@cagent/sdk";
import type { AppConfig } from "../config";
import type { EventBus } from "../events";
import type { Registry } from "../registry";
import type { SkillActivation } from "../skills/types";
import type { ToolCategory } from "../tool-category";
import type { Task } from "../tasks";
import type { LspServer } from "../lsp/doctor";
import type { ProviderUsage } from "../usage";
import type { CustomCommand } from "../commands/types";
import type { SubagentRequest } from "../subagents/executor";
import type { VerificationRunner } from "../verification/runner";

export type ChatItem = {
  kind: "user" | "assistant" | "tool" | "meta" | "thinking";
  content: string;
  turnId?: string;
  imagePaths?: string[];
  filePaths?: string[];
  subagent?: string;
  subagentHeader?: boolean;
  toolName?: string;
  title?: string;
  toolCategory?: ToolCategory;
  cmd?: string;
  isError?: boolean;
  denied?: boolean;
  running?: boolean;
  summary?: string;
  expanded?: boolean;
  timestamp?: number;
  queueStatus?: "queued" | "processing";
  queueMessageId?: string;
  command?: string;
  startedAt?: number;
  durationMs?: number;
  changesWorkspace?: boolean;
  changedPaths?: string[];
  display?: ToolDisplay;
};

export type ToolLogEntry = {
  tool: string;
  cmd: string;
  isError?: boolean;
  denied?: boolean;
  running?: boolean;
};

export type UIState = {
  tasks: Task[];
  taskPanelExpanded?: boolean;
  chat: ChatItem[];
  chatVersion: number;
  toolLog: ToolLogEntry[];
  model: string;
  variant?: string;
  tokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  lastTurnTokensPerSecond?: number;
  lastTurnTimeToFirstTokenMs?: number;
  lastTurnPromptTokensCached?: number;
  providerUsage: (ProviderUsage & { timestamp: number })[];
  usageTotals: ProviderUsage;
  contextWindow: number;
  threshold: number;
  busy: boolean;
  input: string;
  notice: string;
  compacting: boolean;
  pendingAsk: {
    tool: string;
    cmd: string;
    title?: string;
    args?: ToolArgs;
    canAlwaysAllow?: boolean;
    allowScope?: string;
  } | null;
  questionRequest: import("./question-service").QuestionRequest | null;
  questionIndex: number;
  questionSelectedOption: number;
  questionTextAnswer: string;
  questionOtherMode: boolean;
  questionAnswers: string[];
  questionSelectedOptions: number[];
  modelPicker: {
    entries: {
      route: string;
      models: string[];
      details?: Record<string, string>;
    }[];
    query: string;
    selectedIndex?: number;
  } | null;
  sessionList:
    | {
        id: string;
        updated: string;
        title: string;
        cwd?: string;
        branch?: string;
        messageCount: number;
      }[]
    | null;
  sessionAll: {
    id: string;
    updated: string;
    title: string;
    cwd?: string;
    branch?: string;
    messageCount: number;
  }[];
  sessionScope: "project" | "all";
  sessionQuery: string;
  historySearch: boolean;
  historyIdx: number;
  historyEntries: string[];
  helpOpen: boolean;
  helpTopic?: string;
  commandPaletteOpen: boolean;
  commandPaletteQuery: string;
  commandPaletteIndex: number;
  infoPanel: "usage" | "telemetry" | null;
  telemetrySummary?: {
    file: string;
    bytes: number;
    spans: number;
    events: number;
    metrics: number;
    providerCalls: number;
    agentTurns: number;
  };
  lspPanel: boolean;
  lspServers: LspServer[];
  toolViewerIndex: number | null;
  toolViewerTurnId?: string;
  toolViewerChatIndex?: number;
  permissionMode: "ask" | "auto" | "read-only";
  title: string;
  sessionId: string;
  suggest: string[];
  suggestIdx: number;
  inputKey: number;
  turnStartedAt: number | null;
  elapsedMs: number;
  lastEscTime: number;
  currentTurnId?: string;
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

export interface ControllerDeps {
  config: AppConfig;
  registry: Registry;
  bus: EventBus;
  adapter: ProviderAdapter;
  model: string;
  variant?: string;
  contextWindow?: number;
  systemPrompt: string;
  rebuildSystemPrompt?: () => string;
  sessionDir?: string;
  sessionId?: string;
  maxTurns?: number;
  maxToolCalls?: number;
  readOnly?: boolean;
  permissionMode?: "ask" | "auto" | "read-only";
  onText?: (text: string) => void;
  onReasoning?: (text: string) => void;
  onToolEvent?: (event: {
    phase: "start" | "end";
    tool: string;
    content?: string;
    error?: boolean;
  }) => void;
  reloadSkills?: () => void;
  invokeSkill?: (
    name: string,
    args: string,
  ) => Promise<SkillActivation | undefined>;
  skillNames?: () => string[];
  commands?: Map<string, CustomCommand>;
  pluginCommands?: string[];
  pluginCommandSubcommands?: Record<string, string[]>;
  invokeSubagent?: (request: SubagentRequest) => Promise<string>;
  observability?: Observability;
  verification?: VerificationRunner;
  contextExtensions?: ContextExtension[];
  contextTokenBudget?: number;
}
