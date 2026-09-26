import type { ToolOverrides } from "@cagent/sdk";

// OpenAI/Codex surface: edit_file becomes apply_patch (one patch, path inside the patch).
export const CODE_TOOLS_OVERRIDES: ToolOverrides = {
  edit_file: {
    name: "apply_patch",
    description:
      "Codex native FREEFORM apply_patch surface. Do not send JSON. Use *** Begin Patch and *** End Patch. For existing files, use *** Update File: path and @@ hunks with context lines prefixed by space and changes prefixed by + or -. Do not call replace_lines with this surface.",
    parameters: {
      type: "object",
      properties: {
        patch: {
          type: "string",
          description: "Complete patch in the *** Begin patch format",
        },
      },
      required: ["patch"],
    },
  },
};
