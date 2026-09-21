export type TaskStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "blocked";
export type Task = {
  id: string;
  title: string;
  status: TaskStatus;
  reason?: string;
  evidence?: string;
};

export type TaskOperation =
  | { op: "create"; titles: string[] }
  | { op: "add"; title: string }
  | { op: "next"; details?: string }
  | { op: "cancel"; details?: string }
  | { op: "block"; details: string }
  | { op: "list" }
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
  if (tasks.length > 0) throw new Error("task list already exists");
  const cleanTitles = titles.filter(Boolean);
  if (!cleanTitles.length)
    throw new Error("create requires at least one title");
  return cleanTitles.map((title, index) => ({
    id: `${Date.now()}-${index}`,
    title,
    status: index === 0 ? ("in_progress" as const) : ("pending" as const),
  }));
}

export function addTask(tasks: Task[], title: string): Task[] {
  if (!title.trim()) throw new Error("add requires a title");
  const activeIndex = tasks.findIndex((task) => task.status === "in_progress");
  const insertAt = activeIndex < 0 ? tasks.length : activeIndex + 1;
  const added = {
    id: `${Date.now()}-${tasks.length}`,
    title: title.trim(),
    status: "pending" as const,
  };
  return [...tasks.slice(0, insertAt), added, ...tasks.slice(insertAt)];
}

export function advanceTask(
  tasks: Task[],
  status: "completed" | "cancelled",
  details?: string,
): Task[] {
  const activeIndex = tasks.findIndex((task) => task.status === "in_progress");
  if (activeIndex < 0) throw new Error("no task is in progress");
  const updated = tasks.map((task, index) =>
    index === activeIndex
      ? { ...task, status, ...(details ? { evidence: details } : {}) }
      : task,
  );
  const nextIndex = updated.findIndex((task) => task.status === "pending");
  if (nextIndex < 0) return updated;
  return updated.map((task, index) =>
    index === nextIndex ? { ...task, status: "in_progress" } : task,
  );
}

export function blockTask(tasks: Task[], reason: string): Task[] {
  const activeIndex = tasks.findIndex((task) => task.status === "in_progress");
  if (activeIndex < 0) throw new Error("no task is in progress");
  if (!reason.trim()) throw new Error("block requires a request to the user");
  return tasks.map((task, index) =>
    index === activeIndex ? { ...task, status: "blocked", reason } : task,
  );
}

export function applyTaskOperation(
  tasks: Task[],
  operation: TaskOperation,
): Task[] {
  if (operation.op === "create") return createTasks(tasks, operation.titles);
  if (operation.op === "add") return addTask(tasks, operation.title);
  if (operation.op === "next")
    return advanceTask(tasks, "completed", operation.details);
  if (operation.op === "cancel")
    return advanceTask(tasks, "cancelled", operation.details);
  if (operation.op === "block") return blockTask(tasks, operation.details);
  if (operation.op === "list") return tasks;
  return [];
}

export function applyTaskBatch(
  tasks: Task[],
  operations: TaskOperation[],
): Task[] {
  if (!operations.length) throw new Error("batch requires operations");
  return operations.reduce(applyTaskOperation, tasks);
}
