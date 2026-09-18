import type {
  HookDefinition,
  PluginCommand,
  ProviderAdapter,
  SubagentDefinition,
  ToolDefinition,
} from "@cagent/sdk";
import { HookRegistry } from "./hooks";

export class Registry {
  private toolList = new Map<string, ToolDefinition>();
  private providerList = new Map<string, ProviderAdapter>();
  private serviceList = new Map<string, unknown>();
  private subagentList = new Map<string, SubagentDefinition>();
  private commandList = new Map<string, PluginCommand>();
  readonly hooks = new HookRegistry();

  registerTool(tool: ToolDefinition): void {
    if (this.toolList.has(tool.name))
      throw new Error(`duplicate tool: ${tool.name}`);
    this.toolList.set(tool.name, tool);
  }

  registerCommand(command: PluginCommand): void {
    if (this.commandList.has(command.name))
      throw new Error(`duplicate command: ${command.name}`);
    this.commandList.set(command.name, command);
  }

  command(name: string): PluginCommand | undefined {
    return this.commandList.get(name);
  }
  commands(): PluginCommand[] {
    return [...this.commandList.values()];
  }

  registerHook(hook: HookDefinition): void {
    this.hooks.register(hook);
  }

  subagent(name: string): SubagentDefinition | undefined {
    return this.subagentList.get(name);
  }
  subagents(): SubagentDefinition[] {
    return [...this.subagentList.values()];
  }

  registerSubagent(agent: SubagentDefinition): void {
    if (this.subagentList.has(agent.name))
      throw new Error(`duplicate subagent: ${agent.name}`);
    this.subagentList.set(agent.name, agent);
  }

  registerProvider(route: string, adapter: ProviderAdapter): void {
    if (this.providerList.has(route))
      throw new Error(`duplicate provider: ${route}`);
    this.providerList.set(route, adapter);
  }

  register(key: string, service: unknown): void {
    if (this.serviceList.has(key)) throw new Error(`duplicate service: ${key}`);
    this.serviceList.set(key, service);
  }

  tool(name: string): ToolDefinition | undefined {
    return this.toolList.get(name);
  }

  tools(): ToolDefinition[] {
    return [...this.toolList.values()];
  }

  llmRoute(): string | undefined {
    return this.providerList.keys().next().value;
  }

  provider(route: string): ProviderAdapter | undefined {
    return this.providerList.get(route);
  }

  providers(): Map<string, ProviderAdapter> {
    return this.providerList;
  }

  get(key: string): unknown | undefined {
    return this.serviceList.get(key);
  }
}
