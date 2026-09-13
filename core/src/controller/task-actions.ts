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

export function resetCompletedTasks(controller: Controller): void {
  if (controller.state.tasks.length > 0 && controller.state.tasks.every((task) => task.status === "completed")) {
    controller.state.tasks = [];
    controller.session.appendTasks(controller.state.tasks);
    controller.bump();
    controller.observability?.recordEvent("task.completed", { operation: "reset", "task.count": 0 });
  }
}

export function updateTasks(
  controller: Controller,
  operation: string,
  args: Record<string, unknown>,
): string {
  try {
    controller.observability?.recordEvent("task.requested", { operation });
    if (operation === "create") controller.state.tasks = createTasks(controller.state.tasks, (args.titles as string[]) ?? []);
    else if (operation === "update") {
      controller.state.tasks = updateTask(
        controller.state.tasks,
        String(args.id),
        String(args.status) as TaskStatus,
        args.details as string,
      );
    }
    else if (operation === "remove") controller.state.tasks = removeTask(controller.state.tasks, String(args.id));
    else if (operation === "clear") controller.state.tasks = [];
    else if (operation === "list") return JSON.stringify(controller.state.tasks);
    else throw new Error(`unknown task operation: ${operation}`);
    controller.session.appendTasks(controller.state.tasks);
    controller.bump();
    controller.observability?.recordEvent("task.completed", { operation, "task.count": controller.state.tasks.length });
    return JSON.stringify(controller.state.tasks);
  } catch (error) {
    controller.observability?.recordEvent("task.failed", { operation });
    const message = error instanceof Error ? error.message : String(error);
    return `ERROR TASK — ${message}`;
  }
}