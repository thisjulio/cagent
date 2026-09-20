export type TaskStatus = "pending" | "in_progress" | "completed" | "blocked";
export type Task = {
  id: string;
  title: string;
  status: TaskStatus;
  reason?: string;
  evidence?: string;
};

export type TaskOperation =
  | { op: "create"; titles: string[]; startFirst?: boolean }
  | {
      op: "update";
      id: string;
      status: TaskStatus;
      details?: string;
    }
  | { op: "remove"; id: string }
  | { op: "clear" };

export function taskProgress(tasks: Task[]): string {
  return `${tasks.filter((task) => task.status === "completed").length}/${tasks.length}`;
}

export function updateTask(
  tasks: Task[],
  id: string,
  status: TaskStatus,
  details?: string,
): Task[] {
  const task = tasks.find((item) => item.id === id);
  if (!task) throw new Error(`task not found: ${id}`);
  if (status === "in_progress") {
    if (task.status === "completed")
      throw new Error(`completed task requires explicit reopen: ${id}`);
    const current = tasks.find(
      (task) => task.status === "in_progress" && task.id !== id,
    );
    if (current) throw new Error(`task already in progress: ${current.id}`);
    const earlier = tasks
      .slice(0, tasks.indexOf(task))
      .find((item) => item.status !== "completed");
    if (earlier)
      throw new Error(`task must follow unfinished task: ${earlier.id}`);
  }
  if (status === "completed" && !details?.trim())
    throw new Error("task completion requires evidence");
  if (status === "completed" && task.status !== "in_progress") {
    throw new Error(
      `task must be in_progress before completion: ${id}; use one batch with an in_progress update before completion`,
    );
  }
  if (
    status === "pending" &&
    task.status === "completed" &&
    !details?.includes("reopen")
  ) {
    throw new Error(
      `reopening a completed task requires explicit confirmation: ${id}`,
    );
  }
  if (status === "pending" && task.status !== "completed") {
    throw new Error(`only completed tasks can return to pending: ${id}`);
  }
  return tasks.map((task) =>
    task.id === id
      ? {
          ...task,
          status,
          ...(status === "blocked" ? { reason: details } : {}),
          ...(status === "completed" ? { evidence: details } : {}),
        }
      : task,
  );
}

export function createTasks(tasks: Task[], titles: string[]): Task[] {
  return [
    ...tasks,
    ...titles.filter(Boolean).map((title, index) => ({
      id: `${Date.now()}-${tasks.length + index}`,
      title,
      status: "pending" as const,
    })),
  ];
}

export function removeTask(tasks: Task[], id: string): Task[] {
  if (!tasks.some((task) => task.id === id))
    throw new Error(`task not found: ${id}`);
  return tasks.filter((task) => task.id !== id);
}

export function applyTaskOperation(
  tasks: Task[],
  operation: TaskOperation,
): Task[] {
  if (operation.op === "create") {
    const created = createTasks(tasks, operation.titles);
    if (!operation.startFirst) return created;
    const firstCreated = created.slice(tasks.length)[0];
    if (!firstCreated)
      throw new Error("startFirst requires at least one title");
    return updateTask(created, firstCreated.id, "in_progress");
  }
  if (operation.op === "update")
    return updateTask(tasks, operation.id, operation.status, operation.details);
  if (operation.op === "remove") return removeTask(tasks, operation.id);
  return [];
}

export function applyTaskBatch(
  tasks: Task[],
  operations: TaskOperation[],
): Task[] {
  if (!operations.length) throw new Error("batch requires operations");
  return operations.reduce(applyTaskOperation, tasks);
}
