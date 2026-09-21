import { defineTool, type ToolDefinition } from "@cagent/sdk";

export function createTaskTool(
  update: (operation: string, args: Record<string, unknown>) => string,
): ToolDefinition {
  return defineTool(
    "tasks",
    "Manage an ordered task list with create, add, list, next, cancel, block, and clear operations.",
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
                enum: [
                  "create",
                  "add",
                  "list",
                  "next",
                  "cancel",
                  "block",
                  "clear",
                ],
              },
              titles: { type: "array", items: { type: "string" } },
              title: { type: "string" },
              details: {
                type: "string",
                description:
                  "User-facing request required for block; optional note for next or cancel.",
              },
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
