export type PluginCommandContext = {
  name: string;
  arguments: string;
  values: Readonly<Record<string, string | boolean>>;
};

export type PluginCommand = {
  name: string;
  description: string;
  subcommands?: string[];
  execute: (context: PluginCommandContext) => string | Promise<string>;
};
