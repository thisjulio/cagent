import path from "node:path";
import { defineTool, type ToolDefinition } from "@cagent/sdk";
import type { SkillCatalog } from "./types";
import { formatSkillToolOutput } from "./tool-result";
import { listSkillResources, readSkillResource } from "./resources";

export async function readSkill(
  catalog: SkillCatalog,
  name: string,
): Promise<string | undefined> {
  const skill = catalog.byName.get(name);
  if (!skill) return undefined;
  if (skill.content) return skill.content;
  return readSkillResource(
    skill.directory,
    path.relative(skill.directory, skill.instructionFile),
  );
}

export function createReadSkillTool(catalog: SkillCatalog): ToolDefinition {
  const tool = defineTool(
    "skill",
    'Load a skill by its exact name from the available skill list. Omit "resource" for SKILL.md. To load a referenced file, pass its listed relative path in "resource".',
    {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Exact skill name from the available skills.",
          enum: [],
        },
        resource: { type: "string" },
      },
      required: ["name"],
      additionalProperties: false,
    },
    (args) => readSkillTool(catalog, args),
    { readOnly: true },
  );
  refreshReadSkillTool(tool, catalog);
  return tool;
}

export function refreshReadSkillTool(
  tool: ToolDefinition,
  catalog: SkillCatalog,
): void {
  const properties = tool.parameters.properties as Record<string, unknown>;
  const name = properties.name as Record<string, unknown>;
  name.enum = [...catalog.byName.values()]
    .filter((skill) => !skill.metadata.disableModelInvocation)
    .map((skill) => skill.metadata.name);
}

async function readSkillTool(
  catalog: SkillCatalog,
  args: Record<string, unknown>,
) {
  const name = typeof args.name === "string" ? args.name : "";
  const skill = catalog.byName.get(name);
  if (!skill)
    return {
      output: `skill not found: ${name || "(missing name)"}. Available skills: ${
        [...catalog.byName.values()]
          .filter((entry) => !entry.metadata.disableModelInvocation)
          .map((entry) => entry.metadata.name)
          .join(", ") || "none"
      }`,
      isError: true,
    };
  if (skill.metadata.disableModelInvocation)
    return {
      output: `skill is user-invocable only: ${skill.metadata.name}. Ask the user to invoke it with /skill ${skill.metadata.name}.`,
      isError: true,
    };
  const resource =
    typeof args.resource === "string" ? args.resource : "SKILL.md";
  if (resource === "SKILL.md") {
    const content = await readSkill(catalog, skill.metadata.name);
    if (content !== undefined) {
      const files = await listSkillResources(skill.directory);
      return {
        output: formatSkillToolOutput(
          skill.metadata.name,
          skill.directory,
          content,
          files,
        ),
      };
    }
  }
  const content = await readSkillResource(skill.directory, resource);
  if (content !== undefined)
    return {
      output: `Skill: ${skill.metadata.name}\nDirectory: ${skill.directory}\nResource: ${resource}\n\n${content}`,
    };
  return {
    output: `skill resource not found or unsafe: ${resource}`,
    isError: true,
  };
}
