export type TaskStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "skipped"
  | "blocked";

export type Task = {
  id: string;
  title: string;
  status: TaskStatus;
  reason?: string;
  evidence?: string;
};

export function taskProgress(tasks: Task[]): string {
  return `${tasks.filter((task) => task.status === "completed").length}/${tasks.length}`;
}

export function createTasks(tasks: Task[], titles: string[]): Task[] {
  if (tasks.length > 0) throw new Error("task list already exists");
  const cleanTitles = titles.map((title) => title.trim()).filter(Boolean);
  if (!cleanTitles.length)
    throw new Error("create requires at least one title");
  return cleanTitles.map((title, index) => ({
    id: `${Date.now()}-${index}`,
    title,
    status: index === 0 ? "in_progress" : "pending",
  }));
}

export function addTask(tasks: Task[], title: string): Task[] {
  const cleanTitle = title.trim();
  if (!cleanTitle) throw new Error("add requires a title");
  const activeIndex = tasks.findIndex((task) => task.status === "in_progress");
  const insertAt = activeIndex < 0 ? tasks.length : activeIndex + 1;
  const added: Task = {
    id: `${Date.now()}-${tasks.length}`,
    title: cleanTitle,
    status: "pending",
  };
  return [...tasks.slice(0, insertAt), added, ...tasks.slice(insertAt)];
}

export function listTasks(tasks: Task[]): Task[] {
  return tasks.map((task) => ({ ...task }));
}

export function nextTask(tasks: Task[], evidence?: string): Task[] {
  if (!evidence?.trim()) throw new Error("completion evidence is required");
  return advanceTask(tasks, "completed", evidence);
}

export function skipTask(tasks: Task[], reason?: string): Task[] {
  return advanceTask(tasks, "skipped", reason);
}

function validateActiveState(tasks: Task[]): void {
  const activeCount = tasks.filter(
    (task) => task.status === "in_progress",
  ).length;
  if (activeCount > 1) throw new Error("multiple tasks are in progress");
  if (tasks.some((task) => task.status === "blocked") && activeCount > 0)
    throw new Error("a task is blocked; resume it first");
}

function advanceTask(
  tasks: Task[],
  status: "completed" | "skipped",
  details?: string,
): Task[] {
  validateActiveState(tasks);
  const activeIndex = tasks.findIndex((task) => task.status === "in_progress");
  if (activeIndex < 0) throw new Error("no task is in progress");
  const updated = tasks.map((task, index) =>
    index === activeIndex
      ? { ...task, status, ...(details ? { evidence: details } : {}) }
      : task,
  );
  const nextIndex = updated.findIndex((task) => task.status === "pending");
  return nextIndex < 0
    ? updated
    : updated.map((task, index) =>
        index === nextIndex ? { ...task, status: "in_progress" } : task,
      );
}

export function blockTask(tasks: Task[], request: string): Task[] {
  if (!request.trim()) throw new Error("block requires a request to the user");
  validateActiveState(tasks);
  const activeIndex = tasks.findIndex((task) => task.status === "in_progress");
  if (activeIndex < 0) throw new Error("no task is in progress");
  return tasks.map((task, index) =>
    index === activeIndex
      ? { ...task, status: "blocked", reason: request }
      : task,
  );
}

export function clearTasks(): Task[] {
  return [];
}

export function resumeTask(tasks: Task[]): Task[] {
  const blockedIndex = tasks.findIndex((task) => task.status === "blocked");
  if (blockedIndex < 0) throw new Error("no task is blocked");
  if (tasks.filter((task) => task.status === "in_progress").length > 0)
    throw new Error("a task is already in progress");
  return tasks.map((task, index) =>
    index === blockedIndex
      ? { ...task, status: "in_progress", reason: undefined }
      : task,
  );
}

export function activateTask(tasks: Task[]): Task[] {
  validateActiveState(tasks);
  if (tasks.some((task) => task.status === "in_progress"))
    throw new Error("a task is already in progress");
  if (tasks.some((task) => task.status === "blocked"))
    throw new Error("a task is blocked; resume it first");
  const pendingIndex = tasks.findIndex((task) => task.status === "pending");
  if (pendingIndex < 0) throw new Error("no pending task to activate");
  return tasks.map((task, index) =>
    index === pendingIndex ? { ...task, status: "in_progress" } : task,
  );
}
