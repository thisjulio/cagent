import type { ToolOverrides } from "@cagent/sdk";

// OpenAI/Codex surface: edit_file becomes apply_patch (one patch, path inside the patch).
export const CODE_TOOLS_OVERRIDES: ToolOverrides = {
  edit_file: {
    name: "apply_patch",
    description:
      "Edits/creates/deletes files with a patch in the *** Begin patch / *** End patch format (*** Update/Add/Delete File: with a path and @@ hunks).",
    parameters: {
      type: "object",
      properties: {
        patch: { type: "string", description: "Complete patch in the *** Begin patch format" },
      },
      required: ["patch"],
    },
  },
};
