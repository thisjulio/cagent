import type { ToolOverrides } from "@cagent/sdk";

export const LLAMA_TOOL_OVERRIDES: ToolOverrides = {
  edit_file: {
    name: "edit_file",
    description: [
      "Applies a Codex-compatible patch.",
      'Return one JSON object with exactly {"patch":"*** Begin Patch\\n...\\n*** End Patch"}.',
      "Use *** Update File:, *** Add File:, *** Delete File:, optional *** Move to:, @@ hunks, and lines prefixed with +, -, or space.",
      "Do not use markdown fences or conversational text.",
    ].join(" "),
    parameters: {
      type: "object",
      properties: {
        patch: { type: "string", description: "Complete Codex apply_patch text, including Begin and End Patch markers" },
      },
      required: ["patch"],
      additionalProperties: false,
    },
  },
  write_file: {
    name: "write_file",
    description: "Writes a complete file. Return one valid JSON object with exactly {\"path\":\"...\",\"content\":\"...\"}. Do not use markdown fences.",
    parameters: { type: "object", properties: { path: { type: "string", description: "Workspace-relative or absolute file path" }, content: { type: "string", description: "Complete file content" } }, required: ["path", "content"], additionalProperties: false },
  },
  replace_lines: {
    name: "replace_lines",
    description: [
      "Replaces lines in a file. Call read_file on the file first and use the line numbers it shows.",
      'Example: {"path":"src/index.ts","edits":[{"start_line":12,"end_line":14,"content":"export interface A {\\n  id: string;\\n}"}]}',
      "Prefer this tool over edit_file when the region you are changing is longer than three lines.",
      "After it succeeds, call read_file again before editing the same file.",
    ].join(" "),
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path, as shown by read_file" },
        edits: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              start_line: { type: "integer", minimum: 1, description: "First line to replace. Inclusive." },
              end_line: { type: "integer", minimum: 1, description: "Last line to replace. Inclusive." },
              content: { type: "string", description: 'New text for those lines. Empty string ("") deletes them.' },
            },
            required: ["start_line", "end_line", "content"],
            additionalProperties: false,
          },
        },
      },
      required: ["path", "edits"],
      additionalProperties: false,
    },
  },
};
