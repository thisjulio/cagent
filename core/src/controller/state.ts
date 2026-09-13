import type { ProviderAdapter } from "@cagent/sdk";
import type { AppConfig } from "../config";
import type { EventBus } from "../events";
import type { Registry } from "../registry";
import type { SkillActivation } from "../skills/types";
import type { ToolCategory } from "../tool-category";
import type { Task } from "../tasks";
import type { CustomCommand } from "../commands/types";
import type { SubagentRequest } from "../subagents/executor";

export type ChatItem = {
  kind: "user" | "assistant" | "tool" | "meta" | "thinking";
  content: string;
  subagent?: string;
  subagentHeader?: boolean;
  toolName?: string;
  toolCategory?: ToolCategory;
  cmd?: string;
  isError?: boolean;
  denied?: boolean;
  running?: boolean;
  expanded?: boolean;
  timestamp?: number;
  command?: string;
  startedAt?: number;
  durationMs?: number;
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
  chat: ChatItem[];
  chatVersion: number;
  toolLog: ToolLogEntry[];
  model: string;
  tokens: number;
  contextWindow: number;
  threshold: number;
  busy: boolean;
  input: string;
  notice: string;
  pendingAsk: { tool: string; cmd: string } | null;
  modelPicker: { entries: { route: string; models: string[] }[]; query: string } | null;
  sessionList: { id: string; updated: string; title: string }[] | null;
  helpOpen: boolean;
  title: string;
  suggest: string[];
  suggestIdx: number;
  inputKey: number;
  turnStartedAt: number | null;
  elapsedMs: number;
}

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
  contextWindow?: number;
  systemPrompt: string;
  sessionDir?: string;
  sessionId?: string;
  maxTurns?: number;
  maxToolCalls?: number;
  onText?: (text: string) => void;
  onReasoning?: (text: string) => void;
  onToolEvent?: (event: { phase: "start" | "end"; tool: string; content?: string; error?: boolean }) => void;
  reloadSkills?: () => void;
  invokeSkill?: (name: string, args: string) => Promise<SkillActivation | undefined>;
  skillNames?: () => string[];
  commands?: Map<string, CustomCommand>;
  invokeSubagent?: (request: SubagentRequest) => Promise<string>;
}
