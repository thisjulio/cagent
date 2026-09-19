import { defineTool, type ToolDefinition } from "@cagent/sdk";

export function createTaskTool(
  update: (operation: string, args: Record<string, unknown>) => string,
): ToolDefinition {
  return defineTool(
    "tasks",
    "Manage the checklist. For coding work, create a plan first, then mark exactly one task in_progress before using any other tool. Complete only that task with verification evidence. Use batch operations to transition between tasks in a single call.",
    {
      type: "object",
      properties: {
        operation: {
          type: "string",
          enum: ["create", "list", "update", "remove", "clear", "batch"],
        },
        operations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              op: {
                type: "string",
                enum: ["create", "update", "remove"],
              },
              titles: { type: "array", items: { type: "string" } },
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
        titles: { type: "array", items: { type: "string" } },
        id: { type: "string" },
        status: {
          type: "string",
          enum: ["pending", "in_progress", "completed", "blocked"],
        },
        details: {
          type: "string",
          description:
            "Required evidence for completion or reason for blocking.",
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
