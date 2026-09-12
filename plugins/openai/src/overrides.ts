import type { ToolOverrides } from "@cagent/sdk";

// OpenAI/Codex surface: edit_file becomes apply_patch (one patch, path inside the patch).
export const CODE_TOOLS_OVERRIDES: ToolOverrides = {
  edit_file: {
    name: "apply_patch",
    description:
      "The apply_patch tool edits files. This is a FREEFORM tool, so do not wrap the patch in JSON. Use *** Begin Patch and *** End Patch.",
    parameters: {
      type: "object",
      properties: {
        patch: { type: "string", description: "Complete patch in the *** Begin patch format" },
      },
      required: ["patch"],
    },
  },
};
