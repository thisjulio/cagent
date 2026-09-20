import type { Observability } from "./observability";
import type {
  ContextContribution,
  ContextExtension,
  ContextExtensionInput,
} from "./context-extension";
import type { PluginDiagnostics, PluginStorage } from "./plugin-services";
import type { PluginCommand } from "./plugin-command";
import type { ProviderAdapter } from "./providers";
import type { ToolDefinition } from "./tools";
import type {
  HookDefinition,
  WorkflowEventHandler,
  WorkflowEventName,
  WorkflowEventPayload,
  SubagentDefinition,
} from "./workflow";

export type CommandDefinition = { name: string; content: string; file: string };
export interface CommandSource {
  discover(cwd: string): CommandDefinition[];
}
export interface SkillSource {
  discover(cwd: string): string[];
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
