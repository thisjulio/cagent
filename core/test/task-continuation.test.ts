import { describe, expect, it } from "bun:test";
import { advanceTask, createTasks } from "../src/tasks";
import {
  shouldContinueTaskWorkflow,
  taskSignature,
} from "../src/controller/task-continuation";

describe("task continuation", () => {
  it("does not continue after an assistant question", () => {
    const tasks = createTasks([], ["Implement the feature"]);

    expect(
      shouldContinueTaskWorkflow({
        tasks,
        previousSignature: "before",
        assistantText: "What behavior should I implement?",
        interrupted: false,
      }),
    ).toBe(false);
  });

  it("continues only after task state changes", () => {
    const tasks = createTasks(
      [],
      ["Implement the feature", "Verify the feature"],
    );

    expect(
      shouldContinueTaskWorkflow({
        tasks,
        previousSignature: taskSignature(tasks),
        assistantText: "I am ready to continue.",
        interrupted: false,
      }),
    ).toBe(false);

    const active = advanceTask(tasks, "completed");
    expect(
      shouldContinueTaskWorkflow({
        tasks: active,
        previousSignature: taskSignature(tasks),
        assistantText: "The next task is now active.",
        interrupted: false,
      }),
    ).toBe(true);
  });
});
