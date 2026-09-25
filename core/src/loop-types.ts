import type {
  Message,
  Observability,
  ProviderAdapter,
  ToolArgs,
  ToolDefinition,
} from "@cagent/sdk";
import type { EventBus } from "./events";
import type { ToolAsk } from "./tools";
import type { VerificationRunner } from "./verification/runner";

export interface StreamOpts {
  adapter: ProviderAdapter;
  model: string;
  variant?: string;
  messages: Message[];
  messagesForRequest?: (messages: Message[]) => Message[];
  tools: ToolDefinition[];
  onText?: (text: string) => void;
  onReasoning?: (text: string) => void;
  onToolOutput?: (content: string) => void;
  onUsage?: (usage: {
    inputTokens?: number;
    outputTokens?: number;
    cacheReadTokens?: number;
    cacheCreationTokens?: number;
    timeToFirstTokenMs?: number;
    tokensPerSecond?: number;
    promptTokensCached?: number;
  }) => void;
  interrupted?: () => boolean;
  attempts?: number;
  observability?: Observability;
  traceAttributes?: Record<string, string | number | boolean>;
  verification?: VerificationRunner;
  shouldYield?: () => boolean;
}

export interface TurnRecord {
  role: "assistant" | "tool";
  content: string;
  tool_calls?: Message["tool_calls"];
  tool_call_id?: string;
  toolName?: string;
  title?: string;
  args?: ToolArgs;
  isError?: boolean;
  changesWorkspace?: boolean;
  display?: import("@cagent/sdk").ToolDisplay;
}

export interface TurnOpts extends StreamOpts {
  allowlist: string[];
  ask: ToolAsk;
  bus: EventBus;
  readOnly?: boolean;
  hooks?: {
    run(
      event: import("@cagent/sdk").HookEvent,
    ): Promise<import("@cagent/sdk").HookResponse[]>;
  };
  signal?: AbortSignal;
  maxTurns?: number;
  maxToolCalls?: number;
  observability?: Observability;
  traceAttributes?: Record<string, string | number | boolean>;
  continueTurn?: () => Promise<boolean>;
  shouldYield?: () => boolean;
  compactIfNeeded?: () => Promise<void>;
}

export type TurnResult = {
  records: TurnRecord[];
  interrupted: boolean;
  inputTokens?: number;
  outputTokens?: number;
  verification?: {
    passed: boolean;
    output: string;
  };
};
