import { defineTool, type ToolDefinition } from "@cagent/sdk";

export function createTaskTool(update: (operation: string, args: Record<string, unknown>) => string): ToolDefinition {
  return defineTool(
    "tasks",
    "Create, list, or update the session task checklist.",
    { type: "object", properties: {
      operation: { type: "string", enum: ["create", "list", "update", "remove", "clear"] },
      titles: { type: "array", items: { type: "string" } },
      id: { type: "string" }, status: { type: "string", enum: ["pending", "in_progress", "completed", "blocked"] },
      details: { type: "string", description: "Required evidence for completion or reason for blocking." },
    }, required: ["operation"] },
    async (args) => {
      const output = update(String(args.operation), args);
      return { output, isError: output.startsWith("task ") || output.startsWith("unknown ") };
    },
  );
}
