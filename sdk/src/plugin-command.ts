export type PluginCommandContext = {
  name: string;
  arguments: string;
  values: Readonly<Record<string, string | boolean>>;
  sessionId?: string;
  activeTurn?: boolean;
  records?: ReadonlyArray<{
    turnId?: string;
    type: string;
    payload: Record<string, unknown>;
  }>;
  // The plugin invokes commit only inside its reversible workspace transaction.
  restoreConversation?: (
    turnId: string,
    metadata: Record<string, unknown>,
  ) => void;
  appendMetadata?: (payload: Record<string, unknown>) => void;
};

export type PluginCommand = {
  name: string;
  description: string;
  subcommands?: string[];
  execute: (context: PluginCommandContext) => string | Promise<string>;
};
