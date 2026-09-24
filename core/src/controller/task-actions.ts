import type { ToolDefinition } from "@cagent/sdk";
import {
  addTask,
  blockTask,
  clearTasks,
  createTasks,
  listTasks,
  nextTask,
  resumeTask,
  skipTask,
} from "../tasks";
import type { Controller } from "./controller";

export function taskAwareTools(controller: Controller): ToolDefinition[] {
  return controller.registry.tools();
}

export function resetCompletedTasks(controller: Controller): void {
  if (
    controller.state.tasks.length > 0 &&
    controller.state.tasks.every((task) => task.status === "completed")
  ) {
    controller.state.tasks = [];
    controller.session.appendTasks(controller.state.tasks);
    controller.bump();
    controller.observability?.recordEvent("task.completed", {
      operation: "reset",
      "task.count": 0,
    });
  }
}

export function updateTasks(
  controller: Controller,
  operation: string,
  args: Record<string, unknown>,
): string {
  try {
    controller.observability?.recordEvent("task.requested", { operation });
    const nextTasks = applyTaskOperation(
      controller.state.tasks,
      operation,
      args,
    );
    controller.state.tasks = nextTasks;
    controller.session.appendTasks(nextTasks);
    controller.bump();
    controller.observability?.recordEvent("task.completed", {
      operation,
      "task.count": nextTasks.length,
    });
    return JSON.stringify(nextTasks);
  } catch (error) {
    controller.observability?.recordEvent("task.failed", { operation });
    const message = error instanceof Error ? error.message : String(error);
    return `ERROR TASK — ${message}`;
  }
}

function applyTaskOperation(
  tasks: Controller["state"]["tasks"],
  operation: string,
  args: Record<string, unknown>,
) {
  if (operation === "create")
    return createTasks(tasks, stringArray(args.titles));
  if (operation === "add") return addTask(tasks, String(args.title ?? ""));
  if (operation === "list") return listTasks(tasks);
  if (operation === "next") {
    const evidence = optionalString(args.details)?.trim();
    if (!evidence) throw new Error("next requires completion evidence");
    return nextTask(tasks, evidence);
  }
  if (operation === "skip")
    return skipTask(tasks, optionalString(args.details));
  if (operation === "resume") return resumeTask(tasks);
  if (operation === "block")
    return blockTask(tasks, String(args.details ?? ""));
  if (operation === "clear") return clearTasks();
  throw new Error(`unknown task operation: ${operation}`);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
