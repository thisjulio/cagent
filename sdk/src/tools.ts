export type ToolArgs = Record<string, unknown>;
export const TOOL_METADATA_KEY = "_cagent";

export type ToolCallMetadata = {
  title?: string;
};

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
  /** Short plain-text outcome for transcript rows, without newlines (24 characters maximum). */
  summary?: string;
  isError?: boolean;
  denied?: boolean;
  evidence?: ToolEvidence[];
  changesWorkspace?: boolean;
  changedRanges?: Array<{
    path: string;
    startLine: number;
    endLine: number;
  }>;
  display?: ToolDisplay;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  readOnly?: boolean;
  execute: (args: ToolArgs) => Promise<ToolResult>;
}

export function defineTool(
  name: string,
  description: string,
  parameters: Record<string, unknown>,
  execute: (args: ToolArgs) => Promise<ToolResult>,
  options: { readOnly?: boolean } = {},
): ToolDefinition {
  return { name, description, parameters, ...options, execute };
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

export function wrapToolParameters(
  parameters: Record<string, unknown>,
): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      [TOOL_METADATA_KEY]: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description:
              "Required: briefly describe the action of this tool call in plain text. Write an action-oriented title in the user's language, use at most 80 characters, and do not omit it.",
            minLength: 1,
            maxLength: 80,
          },
        },
        required: ["title"],
        additionalProperties: false,
      },
      args: parameters,
    },
    required: [TOOL_METADATA_KEY, "args"],
    additionalProperties: false,
  };
}

export function overrideNameMap(
  overrides: ToolOverrides,
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const [canonical, override] of Object.entries(overrides))
    map[override.name] = canonical;
  return map;
}
