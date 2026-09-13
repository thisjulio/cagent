import { useEffect, useRef } from "react";
import type { ScrollBoxRenderable } from "@opentui/core";
import type { Task } from "../../tasks";
import { taskProgress } from "../../tasks";

export function TaskPanel({ tasks }: { tasks: Task[] }) {
  const scrollbox = useRef<ScrollBoxRenderable>(null);
  const activeTask = tasks.find((task) => task.status === "in_progress");
  const activeIndex = tasks.findIndex((task) => task.id === activeTask?.id);
  const nextPending = activeIndex >= 0 ? tasks.slice(activeIndex + 1).find((task) => task.status === "pending") : undefined;

  useEffect(() => {
    // Scroll to next pending task if it exists, otherwise to active task
    const target = nextPending ?? activeTask;
    if (target) scrollbox.current?.scrollChildIntoView(target.id);
  }, [activeTask?.id, activeTask?.status, nextPending?.id]);

  if (!tasks.some((task) => task.status !== "completed")) return null;
  return <box height={8} flexDirection="column" borderStyle="single" borderColor="#555555" paddingX={1} flexShrink={0}>
    <text fg="#d97757">Tasks {taskProgress(tasks)}</text>
    <scrollbox ref={scrollbox} height={5} minHeight={0} scrollY verticalScrollbarOptions={{ visible: false }}>
      {tasks.map((task) => <text id={task.id} key={task.id} fg={task.status === "in_progress" ? "#d97757" : undefined}>
        {task.status === "completed" ? "☑" : task.status === "in_progress" ? "▶" : task.status === "blocked" ? "⚠" : "☐"} {task.title}{task.status === "blocked" && task.reason ? ` (${task.reason})` : ""}
      </text>)}
    </scrollbox>
  </box>;
}
