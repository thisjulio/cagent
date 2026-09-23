import type { Observability, ProviderAdapter, ToolDisplay } from "@cagent/sdk";
import type { AppConfig } from "../config";
import type { EventBus } from "../events";
import type { Registry } from "../registry";
import type { SkillActivation } from "../skills/types";
import type { ToolCategory } from "../tool-category";
import type { Task } from "../tasks";
import type { CustomCommand } from "../commands/types";
import type { SubagentRequest } from "../subagents/executor";
import type { VerificationRunner } from "../verification/runner";

export type ChatItem = {
  kind: "user" | "assistant" | "tool" | "meta" | "thinking";
  content: string;
  turnId?: string;
  imagePaths?: string[];
  subagent?: string;
  subagentHeader?: boolean;
  toolName?: string;
  title?: string;
  toolCategory?: ToolCategory;
  cmd?: string;
  isError?: boolean;
  denied?: boolean;
  running?: boolean;
  expanded?: boolean;
  timestamp?: number;
  queueStatus?: "queued" | "processing";
  queueMessageId?: string;
  command?: string;
  startedAt?: number;
  durationMs?: number;
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
  contextWindow: number;
  threshold: number;
  busy: boolean;
  input: string;
  notice: string;
  compacting: boolean;
  pendingAsk: { tool: string; cmd: string } | null;
  questionRequest: import("./question-service").QuestionRequest | null;
  questionIndex: number;
  questionSelectedOption: number;
  questionTextAnswer: string;
  questionOtherMode: boolean;
  questionAnswers: string[];
  questionSelectedOptions: number[];
  modelPicker: {
    entries: { route: string; models: string[] }[];
    query: string;
  } | null;
  sessionList: { id: string; updated: string; title: string }[] | null;
  helpOpen: boolean;
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
  sessionDir?: string;
  sessionId?: string;
  maxTurns?: number;
  maxToolCalls?: number;
  readOnly?: boolean;
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
}
