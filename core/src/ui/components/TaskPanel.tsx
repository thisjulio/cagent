import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { ScrollBoxRenderable } from "@opentui/core";
import type { Task } from "../../tasks";
import { taskProgress } from "../../tasks";

export interface TaskPanelHandle {
  toggle: () => void;
}

// Shimmering wave for the active task title
function ShimmerTitle({ title }: { title: string }) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setFrame((f) => f + 1), 150);
    return () => clearInterval(id);
  }, []);

  return (
    <box flexDirection="row">
      {title.split(" ").map((word, wi) => (
        <box key={wi} flexDirection="row">
          {word.split("").map((ch, ci) => {
            const pos = wi * 8 + ci;
            const wave = Math.sin((pos - frame * 0.8) * 0.5);
            const bright = 0.4 + 0.6 * ((wave + 1) / 2);
            const r = Math.round(217 * bright);
            const g = Math.round(119 * bright);
            const b = Math.round(87 * bright);
            return (
              <text
                key={ci}
                fg={`#${r.toString(16).padStart(2, "0")}${g
                  .toString(16)
                  .padStart(2, "0")}${b.toString(16).padStart(2, "0")}`}
              >
                {ch}
              </text>
            );
          })}
          {wi < title.split(" ").length - 1 && <text> </text>}
        </box>
      ))}
    </box>
  );
}

export const TaskPanel = forwardRef<
  TaskPanelHandle,
  { tasks: Task[]; expanded?: boolean }
>(function TaskPanel({ tasks, expanded: expandedProp }, ref) {
  const [expandedState, setExpanded] = useState(false);
  const expanded = expandedProp ?? expandedState;
  const scrollbox = useRef<ScrollBoxRenderable>(null);

  useImperativeHandle(ref, () => ({
    toggle: () => setExpanded((v) => !v),
  }));

  const activeTask = tasks.find((task) => task.status === "in_progress");
  const activeIndex = tasks.findIndex((task) => task.id === activeTask?.id);
  const nextPending =
    activeIndex >= 0
      ? tasks.slice(activeIndex + 1).find((task) => task.status === "pending")
      : undefined;

  useEffect(() => {
    if (!expanded) return;
    const target = nextPending ?? activeTask;
    if (target) scrollbox.current?.scrollChildIntoView(target.id);
  }, [expanded, activeTask?.id, activeTask?.status, nextPending?.id]);

  if (!tasks.some((task) => task.status !== "completed")) return null;

  const current = activeTask ?? nextPending ?? tasks[tasks.length - 1];
  const icon =
    current?.status === "in_progress"
      ? "▶"
      : current?.status === "blocked"
        ? "⚠"
        : "☐";

  if (!expanded) {
    return (
      <box
        height={3}
        minHeight={3}
        maxHeight={3}
        flexDirection="column"
        justifyContent="center"
        paddingX={1}
        flexShrink={0}
        borderStyle="single"
        borderColor="#555555"
      >
        <box flexDirection="row" justifyContent="space-between">
          <box flexDirection="row">
            <text fg="#d97757">{icon} </text>
            {current?.status === "in_progress" ? (
              <ShimmerTitle title={current.title} />
            ) : (
              <text fg="#d97757">{current?.title ?? "Tasks"}</text>
            )}
          </box>
          <text fg="#777777">Tasks {taskProgress(tasks)} (Ctrl+T)</text>
        </box>
      </box>
    );
  }

  return (
    <box
      height={8}
      minHeight={8}
      maxHeight={8}
      flexDirection="column"
      borderStyle="single"
      borderColor="#555555"
      paddingX={1}
      flexShrink={0}
    >
      <box flexDirection="row" justifyContent="space-between">
        <text fg="#d97757">Tasks {taskProgress(tasks)}</text>
        <text fg="#777777">(Ctrl+T)</text>
      </box>
      <scrollbox
        ref={scrollbox}
        height={5}
        minHeight={0}
        scrollY
        verticalScrollbarOptions={{ visible: false }}
      >
        {tasks.map((task) => (
          <text
            id={task.id}
            key={task.id}
            fg={task.status === "in_progress" ? "#d97757" : undefined}
          >
            {task.status === "completed"
              ? "☑"
              : task.status === "in_progress"
                ? "▶"
                : task.status === "blocked"
                  ? "⚠"
                  : "☐"}{" "}
            {task.title}
            {task.status === "blocked" && task.reason
              ? ` (${task.reason})`
              : ""}
          </text>
        ))}
      </scrollbox>
    </box>
  );
});
