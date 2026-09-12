import type { CommandDefinition } from "@cagent/sdk";
export type CustomCommand = CommandDefinition;

export type CommandCatalog = {
  commands: CustomCommand[];
  byName: Map<string, CustomCommand>;
};