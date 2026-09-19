import { defineTool, type ToolDefinition } from "@cagent/sdk";

export function createTaskTool(
  update: (operation: string, args: Record<string, unknown>) => string,
): ToolDefinition {
  return defineTool(
    "tasks",
    "Manage the checklist using one batch call. Combine related changes: create the full plan and set its first task in_progress with startFirst, then complete the current task and start the next task in the same batch. Every completed task requires verification evidence.",
    {
      type: "object",
      properties: {
        operation: {
          type: "string",
          enum: ["batch"],
        },
        operations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              op: {
                type: "string",
                enum: ["create", "update", "remove", "clear"],
              },
              titles: { type: "array", items: { type: "string" } },
              startFirst: {
                type: "boolean",
                description:
                  "For create, start the first newly created task in the same batch.",
              },
              id: { type: "string" },
              status: {
                type: "string",
                enum: ["pending", "in_progress", "completed", "blocked"],
              },
              details: { type: "string" },
            },
            required: ["op"],
          },
        },
      },
      required: ["operation", "operations"],
    },
    async (args) => {
      const output = update(String(args.operation), args);
      return { output, isError: output.startsWith("ERROR TASK") };
    },
  );
}
