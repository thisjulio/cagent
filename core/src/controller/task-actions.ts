import type { ToolArgs, ToolDefinition } from "@cagent/sdk";
import { createTasks, removeTask, updateTask, type TaskStatus } from "../tasks";
import type { Controller } from "./controller";

export function taskAwareTools(controller: Controller): ToolDefinition[] {
  return controller.registry.tools().map((tool) => tool.name === "tasks" ? tool : {
    ...tool,
    execute: async (args: ToolArgs) => {
      if (!controller.state.tasks.some((task) => task.status === "in_progress")) {
        return { output: "blocked: mark exactly one task in_progress before using other tools", isError: true };
      }
      return tool.execute(args);
    },
  });
}

export function updateTasks(
  controller: Controller,
  operation: string,
  args: Record<string, unknown>,
): string {
  try {
    if (operation === "create") controller.state.tasks = createTasks(controller.state.tasks, (args.titles as string[]) ?? []);
    else if (operation === "update") {
      controller.state.tasks = updateTask(
        controller.state.tasks,
        String(args.id),
        String(args.status) as TaskStatus,
        args.details as string,
      );
      // Auto-clear when all tasks are completed so the box disappears
      // and new requests start with a fresh task list
      if (controller.state.tasks.length > 0 && controller.state.tasks.every((task) => task.status === "completed")) {
        controller.state.tasks = [];
      }
    }
    else if (operation === "remove") controller.state.tasks = removeTask(controller.state.tasks, String(args.id));
    else if (operation === "clear") controller.state.tasks = [];
    else if (operation === "list") return JSON.stringify(controller.state.tasks);
    else throw new Error(`unknown task operation: ${operation}`);
    controller.session.appendTasks(controller.state.tasks);
    controller.bump();
    return JSON.stringify(controller.state.tasks);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}