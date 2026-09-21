import type { ToolArgs, ToolDefinition } from "@cagent/sdk";
import { applyTaskBatch, type TaskOperation } from "../tasks";
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
    if (operation !== "batch")
      throw new Error("only the batch operation is supported");
    const ops = parseTaskOperations(args.operations);
    const nextTasks = applyTaskBatch(controller.state.tasks, ops);
    controller.state.tasks = nextTasks;
    controller.session.appendTasks(controller.state.tasks);
    controller.bump();
    controller.observability?.recordEvent("task.completed", {
      operation,
      "task.count": controller.state.tasks.length,
    });
    return JSON.stringify(controller.state.tasks);
  } catch (error) {
    controller.observability?.recordEvent("task.failed", { operation });
    const message = error instanceof Error ? error.message : String(error);
    return `ERROR TASK — ${message}`;
  }
}

function parseTaskOperations(value: unknown): TaskOperation[] {
  if (!Array.isArray(value)) throw new Error("batch requires operations array");
  return value.map((raw) => {
    if (!raw || typeof raw !== "object")
      throw new Error("each batch operation must be an object");
    const operation = raw as Record<string, unknown>;
    const op = String(operation.op);
    if (op === "create")
      return {
        op,
        titles: (operation.titles as string[]) ?? [],
      };
    if (op === "add") return { op, title: String(operation.title ?? "") };
    if (op === "list") return { op };
    if (op === "next" || op === "cancel")
      return { op, details: operation.details as string | undefined };
    if (op === "block") return { op, details: String(operation.details ?? "") };
    if (op === "clear") return { op };
    throw new Error(`unknown task operation: ${op}`);
  }) as TaskOperation[];
}
