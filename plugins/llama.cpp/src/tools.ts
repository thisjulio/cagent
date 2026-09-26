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
        patch: {
          type: "string",
          description:
            "Complete Codex apply_patch text, including Begin and End Patch markers",
        },
      },
      required: ["patch"],
      additionalProperties: false,
    },
  },
  write_file: {
    name: "write_file",
    description:
      'Writes a complete file. Return one valid JSON object with exactly {"path":"...","content":"..."}. Do not use markdown fences.',
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Workspace-relative or absolute file path",
        },
        content: { type: "string", description: "Complete file content" },
      },
      required: ["path", "content"],
      additionalProperties: false,
    },
  },
  replace_lines: {
    name: "replace_lines",
    description: [
      "Replaces lines in a file. Call read_file on the file first and copy the current lines into old_content.",
      'Return one JSON object with exactly {"path":"...","edits":[{"start_line":1,"end_line":1,"old_content":"...","content":"..."}]}; do not send the edits array alone.',
      'Example: {"path":"src/index.ts","edits":[{"start_line":12,"end_line":14,"old_content":"interface A {\\n  id: number;\\n}","content":"export interface A {\\n  id: string;\\n}"}]}',
      "The edit is rejected when old_content does not exactly match the numbered lines.",
      "After it succeeds, call read_file again before editing the same file.",
    ].join(" "),
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "File path, as shown by read_file",
        },
        edits: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              start_line: {
                type: "integer",
                minimum: 1,
                description: "First line to replace. Inclusive.",
              },
              end_line: {
                type: "integer",
                minimum: 1,
                description: "Last line to replace. Inclusive.",
              },
              old_content: {
                type: "string",
                description:
                  "Exact current content of the numbered lines, copied from read_file",
              },
              content: {
                type: "string",
                description:
                  'New text for those lines. Empty string ("") deletes them.',
              },
            },
            required: ["start_line", "end_line", "old_content", "content"],
            additionalProperties: false,
          },
        },
      },
      required: ["path", "edits"],
      additionalProperties: false,
    },
  },
};
