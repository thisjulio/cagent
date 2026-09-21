import { describe, expect, it } from "bun:test";
import {
  addTask,
  advanceTask,
  applyTaskBatch,
  blockTask,
  createTasks,
  taskProgress,
} from "../src/tasks";

describe("task domain", () => {
  it("creates an ordered list and starts index zero", () => {
    const tasks = createTasks([], ["Plan", "Test"]);
    expect(tasks.map((task) => task.status)).toEqual([
      "in_progress",
      "pending",
    ]);
    expect(taskProgress(tasks)).toBe("0/2");
  });

  it("adds immediately after the active task", () => {
    const initial = createTasks([], ["Plan", "Verify", "Release"]);
    const active = advanceTask(initial, "completed");
    const tasks = addTask(active, "Review");
    expect(tasks.map((task) => task.title)).toEqual([
      "Plan",
      "Verify",
      "Review",
      "Release",
    ]);
  });

  it("next completes the current task and starts the next", () => {
    const initial = createTasks([], ["Plan", "Verify"]);
    const tasks = advanceTask(initial, "completed", "verified");
    expect(tasks.map((task) => task.status)).toEqual([
      "completed",
      "in_progress",
    ]);
    expect(tasks[0]?.evidence).toBe("verified");
  });

  it("cancel advances and marks the current task cancelled", () => {
    const initial = createTasks([], ["Plan", "Verify"]);
    const tasks = advanceTask(initial, "cancelled");
    expect(tasks.map((task) => task.status)).toEqual([
      "cancelled",
      "in_progress",
    ]);
  });

  it("block records a request and does not advance", () => {
    const initial = createTasks([], ["Plan", "Verify"]);
    const tasks = blockTask(initial, "Ask the user for credentials");
    expect(tasks[0]?.status).toBe("blocked");
    expect(tasks[0]?.reason).toBe("Ask the user for credentials");
    expect(tasks[1]?.status).toBe("pending");
  });

  it("supports create, next, and clear operations", () => {
    const initial = applyTaskBatch(
      [],
      [{ op: "create", titles: ["Plan", "Verify"] }],
    );
    const advanced = applyTaskBatch(initial, [{ op: "next" }]);
    expect(advanced[0]?.status).toBe("completed");
    expect(applyTaskBatch(advanced, [{ op: "clear" }])).toEqual([]);
  });
});
