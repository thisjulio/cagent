import type { Message, ProviderAdapter, ToolDefinition } from "@cagent/sdk";
import { runTurn } from "../loop";
import type { EventBus } from "../events";
import type { ToolAsk } from "../tools";
import { splitRoute } from "../route";
import type { Registry } from "../registry";

export type SubagentRequest = {
  name: string;
  task: string;
  context: Message[];
};
export type SubagentExecutor = {
  (request: SubagentRequest): Promise<string>;
  (name: string, task: string): Promise<string>;
};

export type SubagentExecutionDeps = {
  find: (
    name: string,
  ) => { instructions: string; model?: string; tools?: string[] } | undefined;
  registry: Registry;
  model: () => string;
  tools: ToolDefinition[];
  allowlist: string[];
  ask: ToolAsk;
  bus: EventBus;
};

export function createSubagentExecutor(
  deps: SubagentExecutionDeps,
): SubagentExecutor {
  return async (request: SubagentRequest | string, legacyTask?: string) => {
    const { name, task, context } =
      typeof request === "string"
        ? { name: request, task: legacyTask ?? "", context: [] }
        : request;
    const agent = deps.find(name);
    if (!agent) return `subagent not found: ${name}`;
    const available = deps.tools.filter((tool) => tool.name !== "subagent");
    const allowed = agent.tools?.length
      ? available.filter((tool) => agent.tools?.includes(tool.name))
      : available;
    const messages: Message[] = [
      { role: "system", content: agent.instructions },
      ...context,
      { role: "user", content: task },
    ];
    const route = deps.model();
    if (!route) return "subagent model is unavailable";
    const [provider, model] = splitRoute(route);
    const adapter = deps.registry.provider(provider);
    if (!adapter) return `subagent provider not found: ${provider}`;
    const result = await runTurn({
      adapter,
      model,
      messages,
      tools: allowed,
      allowlist: deps.allowlist,
      ask: deps.ask,
      bus: deps.bus,
      hooks: deps.registry.hooks,
    });
    return (
      result.records
        .filter((record) => record.role === "assistant")
        .map((record) => record.content)
        .filter(Boolean)
        .join("\n\n") || "(subagent returned no text)"
    );
  };
}
