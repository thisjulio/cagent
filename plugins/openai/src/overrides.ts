import type { ToolOverrides } from "@cagent/sdk";

// superfície openai/Codex: edit_file vira apply_patch (patch único, caminho dentro do patch)
export const CODE_TOOLS_OVERRIDES: ToolOverrides = {
  edit_file: {
    name: "apply_patch",
    description:
      "Edita arquivos com um patch no formato *** Begin patch / *** End patch (caminho do arquivo e @@ hunks dentro do patch).",
    parameters: {
      type: "object",
      properties: {
        patch: { type: "string", description: "Patch completo no formato *** Begin patch" },
      },
      required: ["patch"],
    },
  },
};
