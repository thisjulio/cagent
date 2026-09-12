import { defineTool, type ToolDefinition } from "@cagent/sdk";
import type { SubagentExecutor } from "./executor";

export function createSubagentTool(names: () => string[], execute: SubagentExecutor): ToolDefinition {
  return defineTool(
    "subagent",
    "Delegate a focused task to a registered subagent and return its final response.",
    {
      type: "object",
      properties: {
        name: { type: "string", enum: names() },
        task: { type: "string", description: "A self-contained task for the subagent." },
      },
      required: ["name", "task"],
    },
    async (args) => {
      const name = String(args.name ?? "");
      const task = String(args.task ?? "").trim();
      if (!names().includes(name)) return { output: `unknown subagent: ${name}`, isError: true };
      if (!task) return { output: "subagent task is required", isError: true };
      return { output: await execute(name, task) };
    },
  );
}