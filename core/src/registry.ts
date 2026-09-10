import type { ProviderAdapter, ToolDefinition } from "@cagent/sdk";

export class Registry {
  private toolList = new Map<string, ToolDefinition>();
  private providerList = new Map<string, ProviderAdapter>();
  private serviceList = new Map<string, unknown>();

  registerTool(tool: ToolDefinition): void {
    if (this.toolList.has(tool.name)) throw new Error(`tool duplicada: ${tool.name}`);
    this.toolList.set(tool.name, tool);
  }

  registerProvider(route: string, adapter: ProviderAdapter): void {
    if (this.providerList.has(route)) throw new Error(`provedor duplicado: ${route}`);
    this.providerList.set(route, adapter);
  }

  register(key: string, service: unknown): void {
    if (this.serviceList.has(key)) throw new Error(`serviço duplicado: ${key}`);
    this.serviceList.set(key, service);
  }

  tool(name: string): ToolDefinition | undefined {
    return this.toolList.get(name);
  }

  tools(): ToolDefinition[] {
    return [...this.toolList.values()];
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
