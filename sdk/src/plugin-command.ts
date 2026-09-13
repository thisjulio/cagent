export type PluginCommandContext = {
  name: string;
  arguments: string;
  values: Readonly<Record<string, string | boolean>>;
};

export type PluginCommand = {
  name: string;
  description: string;
  execute: (context: PluginCommandContext) => string | Promise<string>;
};
