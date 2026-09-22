import { describe, expect, it } from "bun:test";
import {
  addTask,
  blockTask,
  clearTasks,
  createTasks,
  listTasks,
  nextTask,
  skipTask,
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
    const active = nextTask(initial);
    const tasks = addTask(active, "Review");
    expect(tasks.map((task) => task.title)).toEqual([
      "Plan",
      "Verify",
      "Review",
      "Release",
    ]);
  });

  it("next completes and starts the next task", () => {
    const tasks = nextTask(createTasks([], ["Plan", "Verify"]), "verified");
    expect(tasks.map((task) => task.status)).toEqual([
      "completed",
      "in_progress",
    ]);
    expect(tasks[0]?.evidence).toBe("verified");
  });

  it("skip advances without completing the current task", () => {
    const tasks = skipTask(
      createTasks([], ["Plan", "Verify"]),
      "not applicable",
    );
    expect(tasks.map((task) => task.status)).toEqual([
      "skipped",
      "in_progress",
    ]);
  });

  it("block records a request and does not advance", () => {
    const tasks = blockTask(
      createTasks([], ["Plan", "Verify"]),
      "Ask the user",
    );
    expect(tasks[0]?.status).toBe("blocked");
    expect(tasks[0]?.reason).toBe("Ask the user");
  });

  it("lists without exposing mutable task objects and clears", () => {
    const initial = createTasks([], ["Plan"]);
    expect(listTasks(initial)).toEqual(initial);
    expect(clearTasks()).toEqual([]);
  });
});
