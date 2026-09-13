import type { ToolOverrides } from "@cagent/sdk";

export const LLAMA_TOOL_OVERRIDES: ToolOverrides = {
  edit_file: {
    name: "edit_file",
    description: "Edits an existing file using one JSON object with path and blocks. blocks MUST contain exact delimiters: <<< SEARCH\\ntext to find\\n>>>\\n<<< REPLACE\\nreplacement text\\n>>>. Read the file first. Do not use markdown fences, *** patches, shell commands, or conversational text.",
    parameters: { type: "object", properties: { path: { type: "string", description: "File path to edit" }, blocks: { type: "string", description: "Exact SEARCH/REPLACE blocks. Example: <<< SEARCH\\nold text\\n>>>\\n<<< REPLACE\\nnew text\\n>>>" } }, required: ["path", "blocks"], additionalProperties: false },
  },
  write_file: {
    name: "write_file",
    description: "Writes a complete file. Return one valid JSON object with exactly {\"path\":\"...\",\"content\":\"...\"}. Escape newlines inside content as \\n; do not use markdown fences.",
    parameters: { type: "object", properties: { path: { type: "string", description: "Workspace-relative or absolute file path" }, content: { type: "string", description: "Complete file content; preserve it as a JSON string" } }, required: ["path", "content"], additionalProperties: false },
  },
};
