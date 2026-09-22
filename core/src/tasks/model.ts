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
  return advanceTask(tasks, "completed", evidence);
}

export function skipTask(tasks: Task[], reason?: string): Task[] {
  return advanceTask(tasks, "skipped", reason);
}

function advanceTask(
  tasks: Task[],
  status: "completed" | "skipped",
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
  return nextIndex < 0
    ? updated
    : updated.map((task, index) =>
        index === nextIndex ? { ...task, status: "in_progress" } : task,
      );
}

export function blockTask(tasks: Task[], request: string): Task[] {
  if (!request.trim()) throw new Error("block requires a request to the user");
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
