import type { Observability } from "./observability";
import type {
  ContextContribution,
  ContextExtension,
  ContextExtensionInput,
} from "./context-extension";
import type { PluginDiagnostics, PluginStorage } from "./plugin-services";
import type { PluginCommand } from "./plugin-command";

export type ToolArgs = Record<string, unknown>;

export type ToolEvidence = {
  path: string;
  symbol?: string;
  line?: number;
  commit?: string;
  kind?: "code" | "test" | "adr" | "docs";
};
export interface ToolResult {
  output: string;
  isError?: boolean;
  evidence?: ToolEvidence[];
}

export {
  type ContextContribution,
  type ContextExtension,
  type ContextExtensionInput,
  orderContextExtensions,
} from "./context-extension";
export {
  type Diagnostic,
  type DiagnosticLevel,
  type PluginDiagnostics,
  type PluginStorage,
} from "./plugin-services";
export {
  type PluginCommand,
  type PluginCommandContext,
} from "./plugin-command";

export const WORKFLOW_EVENTS = [
  "session.started",
  "message.submitted",
  "prompt.assembling",
  "prompt.assembled",
  "tool.completed",
  "turn.completed",
  "session.compacted",
  "session.completed",
] as const;

export type WorkflowEventName = (typeof WORKFLOW_EVENTS)[number];
export type WorkflowEventPayload = {
  version: 1;
  sessionId?: string;
  projectId?: string;
  data: Readonly<Record<string, unknown>>;
};
export type WorkflowEventHandler = (
  payload: WorkflowEventPayload,
) => unknown | Promise<unknown>;

export function workflowEvent(
  data: Record<string, unknown>,
  identifiers: Pick<WorkflowEventPayload, "sessionId" | "projectId"> = {},
): WorkflowEventPayload {
  return { version: 1, ...identifiers, data };
}

export type HookPhase =
  | "before_tool"
  | "after_tool"
  | "session_start"
  | "user_prompt_submit"
  | "subagent_start";
export type HookAction = "allow" | "ask" | "deny" | "continue";

export type HookEvent = {
  phase: HookPhase;
  tool?: string;
  args?: ToolArgs;
  result?: ToolResult;
  error?: string;
  prompt?: string;
  subagent?: string;
  task?: string;
};

export type HookResponse = {
  action: HookAction;
  reason?: string;
  message?: string;
};

export type HookHandler = (
  event: HookEvent,
) => HookResponse | void | Promise<HookResponse | void>;

export type HookDefinition = {
  name: string;
  phase: HookPhase;
  handle: HookHandler;
};

export type SubagentDefinition = {
  name: string;
  description: string;
  instructions: string;
  model?: string;
  tools?: string[];
};

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: ToolArgs) => Promise<ToolResult>;
}

export function defineTool(
  name: string,
  description: string,
  parameters: Record<string, unknown>,
  execute: (args: ToolArgs) => Promise<ToolResult>,
): ToolDefinition {
  return { name, description, parameters, execute };
}

// Provider-declared schema override: same canonical name, schema changed to the
// model family's native format. The canonical name (map key) remains valid for
// the UI, logs, and metrics.
export type ToolSchemaOverride = {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
};

export type ToolOverrides = Record<string, ToolSchemaOverride>;

export function applyToolOverrides(
  tools: ToolDefinition[],
  overrides: ToolOverrides,
): ToolDefinition[] {
  return tools.map((t) => {
    const ov = overrides[t.name];
    return ov
      ? {
          ...t,
          name: ov.name,
          description: ov.description ?? t.description,
          parameters: ov.parameters ?? t.parameters,
        }
      : t;
  });
}

export function overrideNameMap(
  overrides: ToolOverrides,
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const [canonical, ov] of Object.entries(overrides))
    map[ov.name] = canonical;
  return map;
}

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; mime_type?: string } };

export function toContentParts(content: string | ContentPart[]): ContentPart[] {
  if (typeof content === "string") return [{ type: "text", text: content }];
  return content;
}

export type Message = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ContentPart[];
  tool_calls?: { id: string; name: string; arguments: string }[];
  tool_call_id?: string;
};

export type WireMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | any[];
  tool_calls?: {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }[];
  tool_call_id?: string;
};

// Chat completions wire format (assistant: tool_calls with type/function; tool: tool_call_id).
export function toChatMessages(messages: Message[]): WireMessage[] {
  return messages.map((m) => {
    const out: WireMessage = { role: m.role, content: m.content };
    if (typeof m.content === "object") {
      out.content = m.content.map((part) => {
        if (part.type === "text") return { type: "text", text: part.text };
        if (part.type === "image_url")
          return { type: "image_url", image_url: { url: part.image_url.url } };
        return part;
      });
    }
    if (m.tool_call_id) out.tool_call_id = m.tool_call_id;
    if (m.tool_calls?.length) {
      out.tool_calls = m.tool_calls.map((tc) => ({
        id: tc.id,
        type: "function",
        function: { name: tc.name, arguments: tc.arguments },
      }));
    }
    return out;
  });
}

export type LlmChunk =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | {
      type: "tool-call";
      tool_call: { id: string; name: string; arguments: string };
    }
  | {
      type: "finish";
      finish_reason: string;
      usage?: { input_tokens: number; output_tokens: number };
    };

export interface LlmCallOptions {
  model: string;
  messages: Message[];
  tools: ToolDefinition[];
  variant?: string;
}

export interface ProviderAdapter {
  list_models(): Promise<string[]>;
  context_window?(model: string): Promise<number | undefined>;
  supported_variants?(model: string): Promise<string[]>;
  tool_overrides?(): ToolOverrides;
  prepare_call(options: LlmCallOptions): Promise<LlmCallOptions>;
  stream(request: LlmCallOptions): AsyncGenerator<LlmChunk>;
  estimate_tokens?(model: string, messages: Message[]): number | undefined;
}

export interface PluginContext {
  name: string;
  config: Record<string, unknown>;
  observability: Observability;
  registerTool(tool: ToolDefinition): void;
  registerHook(hook: HookDefinition): void;
  registerProvider(route: string, adapter: ProviderAdapter): void;
  registerSubagent(agent: SubagentDefinition): void;
  emit(
    event: WorkflowEventName | string,
    payload: WorkflowEventPayload | unknown,
  ): void;
  on(
    event: WorkflowEventName | string,
    handler: WorkflowEventHandler | ((payload: unknown) => unknown),
  ): void;
  registerContextExtension(extension: ContextExtension): void;
  storage: PluginStorage;
  diagnostics: PluginDiagnostics;
  promptSection(name: string, content: string): void;
  registerCommandSource(source: CommandSource): void;
  registerCommand(command: PluginCommand): void;
  registerSkillSource(source: SkillSource): void;
  contributeContext(
    input: ContextExtensionInput,
  ): Promise<ContextContribution[]>;
  activity(
    content: string,
    attributes?: Readonly<Record<string, string | number | boolean>>,
  ): void;
  registerCleanup(fn: () => void | Promise<void>): void;
}

export type Plugin = (ctx: PluginContext) => void | Promise<void>;

export {
  InMemoryObservability,
  noopObservability,
  trace,
  type Attributes,
  type Observability,
  type Span,
  type SpanRecord,
} from "./observability";

export type CommandDefinition = { name: string; content: string; file: string };
export interface CommandSource {
  discover(cwd: string): CommandDefinition[];
}
export interface SkillSource {
  discover(cwd: string): string[];
}
