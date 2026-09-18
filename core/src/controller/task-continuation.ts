import type { Task } from "../tasks";

export type TaskContinuationInput = {
  tasks: Task[];
  previousSignature: string;
  assistantText: string;
  interrupted: boolean;
};

export function taskSignature(tasks: Task[]): string {
  return tasks
    .map((task) => `${task.id}:${task.status}:${task.evidence ?? ""}`)
    .join("|");
}

export function shouldContinueTaskWorkflow(
  input: TaskContinuationInput,
): boolean {
  if (
    input.interrupted ||
    taskSignature(input.tasks) === input.previousSignature
  )
    return false;
  if (
    !input.tasks.length ||
    input.tasks.some((task) => task.status === "blocked")
  )
    return false;
  if (!input.tasks.some((task) => task.status === "pending")) return false;
  return !input.assistantText.trimEnd().endsWith("?");
}
