import type { ProviderAdapter } from "@cagent/sdk";
import type { AppConfig } from "../config";
import type { EventBus } from "../events";
import type { Registry } from "../registry";

export type ChatItem = {
  kind: "user" | "assistant" | "tool" | "meta" | "thinking";
  content: string;
  toolName?: string;
  cmd?: string;
  isError?: boolean;
  denied?: boolean;
  running?: boolean;
  expanded?: boolean;
};

export type ToolLogEntry = {
  tool: string;
  cmd: string;
  isError?: boolean;
  denied?: boolean;
  running?: boolean;
};

export type UIState = {
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
  reloadSkills?: () => void;
}
