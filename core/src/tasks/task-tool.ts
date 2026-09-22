import { defineTool, type ToolDefinition } from "@cagent/sdk";

export function createTaskTool(
  update: (operation: string, args: Record<string, unknown>) => string,
): ToolDefinition {
  return defineTool(
    "tasks",
    "Manage an ordered task list with direct create, add, list, next, skip, block, and clear operations.",
    {
      type: "object",
      properties: {
        operation: {
          type: "string",
          enum: ["create", "add", "list", "next", "skip", "block", "clear"],
        },
        titles: { type: "array", items: { type: "string" } },
        title: { type: "string" },
        details: {
          type: "string",
          description:
            "Evidence for next, reason for skip, or user-facing request required for block.",
        },
      },
      required: ["operation"],
    },
    async (args) => {
      const output = update(String(args.operation), args);
      return { output, isError: output.startsWith("ERROR TASK") };
    },
  );
}
