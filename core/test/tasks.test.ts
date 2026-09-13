import { describe, expect, it } from "bun:test";
import { createTasks, removeTask, taskProgress, updateTask } from "../src/tasks";

describe("task domain", () => {
  it("creates tasks and reports progress", () => {
    const tasks = createTasks([], ["Plan", "Test"]);
    expect(tasks).toHaveLength(2);
    expect(taskProgress(tasks)).toBe("0/2");
  });

  it("requires evidence and permits one active task", () => {
    const tasks = createTasks([], ["Plan", "Test"]);
    const active = updateTask(tasks, tasks[0].id, "in_progress");
    expect(() => updateTask(tasks, tasks[0].id, "completed", "skipped")).toThrow("in_progress");
    expect(() => updateTask(active, tasks[0].id, "completed")).toThrow("evidence");
    expect(() => updateTask(active, tasks[1].id, "in_progress")).toThrow("already in progress");
    expect(updateTask(active, tasks[0].id, "completed", "bun test").at(0)?.evidence).toBe("bun test");
    const completed = updateTask(active, tasks[0].id, "completed", "bun test");
    expect(() => updateTask(completed, tasks[0].id, "pending")).toThrow("explicit confirmation");
  });

  it("removes existing tasks and rejects unknown ids", () => {
    const tasks = createTasks([], ["Plan"]);
    expect(removeTask(tasks, tasks[0].id)).toEqual([]);
    expect(() => removeTask(tasks, "missing")).toThrow("task not found");
  });

  it("enforces task order and rejects reopening without confirmation", () => {
    const tasks = createTasks([], ["Plan", "Verify"]);
    expect(() => updateTask(tasks, tasks[1].id, "in_progress")).toThrow("follow unfinished task");
    const active = updateTask(tasks, tasks[0].id, "in_progress");
    const completed = updateTask(active, tasks[0].id, "completed", "verified");
    expect(() => updateTask(completed, tasks[0].id, "in_progress")).toThrow("explicit reopen");
    expect(() => updateTask(completed, tasks[0].id, "pending")).toThrow("explicit confirmation");
    expect(() => updateTask(completed, tasks[1].id, "pending")).toThrow("only completed");
  });
});