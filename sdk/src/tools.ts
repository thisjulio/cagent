export type ToolArgs = Record<string, unknown>;

export type ToolEvidence = {
  path: string;
  symbol?: string;
  line?: number;
  commit?: string;
  kind?: "code" | "test" | "adr" | "docs";
};

export type ToolDisplay =
  | { kind: "diff"; content: string; filetype?: string; path?: string }
  | {
      kind: "code";
      content: string;
      filetype?: string;
      path?: string;
      lineStart?: number;
      lineNumbers?: boolean;
    }
  | {
      kind: "terminal";
      stdout: string;
      stderr?: string;
      exitCode?: number;
      timedOut?: boolean;
    };

export interface ToolResult {
  output: string;
  isError?: boolean;
  evidence?: ToolEvidence[];
  changesWorkspace?: boolean;
  display?: ToolDisplay;
}

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
  return tools.map((tool) => {
    const override = overrides[tool.name];
    return override
      ? {
          ...tool,
          name: override.name,
          description: override.description ?? tool.description,
          parameters: override.parameters ?? tool.parameters,
        }
      : tool;
  });
}

export function overrideNameMap(
  overrides: ToolOverrides,
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const [canonical, override] of Object.entries(overrides))
    map[override.name] = canonical;
  return map;
}
