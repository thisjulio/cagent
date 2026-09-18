import type { SubagentDefinition } from "@cagent/sdk";
export type SubagentRecord = SubagentDefinition & { source: string };
export type SubagentCatalog = {
  agents: SubagentRecord[];
  byName: Map<string, SubagentRecord>;
};
