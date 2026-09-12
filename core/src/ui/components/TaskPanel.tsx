import type { Task } from "../../tasks";
import { taskProgress } from "../../tasks";

export function TaskPanel({ tasks }: { tasks: Task[] }) {
  if (!tasks.some((task) => task.status !== "completed")) return null;
  return <box flexDirection="column" borderStyle="single" borderColor="#555555" paddingX={1} flexShrink={0}>
    <text fg="#d97757">Tasks {taskProgress(tasks)}</text>
    {tasks.map((task) => <text key={task.id} fg={task.status === "in_progress" ? "#d97757" : undefined}>
      {task.status === "completed" ? "☑" : task.status === "in_progress" ? "▶" : task.status === "blocked" ? "⚠" : "☐"} {task.title}{task.status === "blocked" && task.reason ? ` (${task.reason})` : ""}
    </text>)}
  </box>;
}
