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
import { symbols } from "../theme/symbols";
import { useTheme } from "../primitives/theme-context";
import { Panel } from "../primitives/Panel";
import { ShimmerText } from "../primitives/ShimmerText";
import { DisclosureIndicator } from "../primitives/DisclosureIndicator";

export interface TaskPanelHandle {
  toggle: () => void;
}

export const TaskPanel = forwardRef<
  TaskPanelHandle,
  { tasks: Task[]; expanded?: boolean }
>(function TaskPanel({ tasks, expanded: expandedProp }, ref) {
  const [expandedState, setExpanded] = useState(false);
  const expanded = expandedProp ?? expandedState;
  const scrollbox = useRef<ScrollBoxRenderable>(null);
  const { color } = useTheme();

  useImperativeHandle(ref, () => ({
    toggle: () => setExpanded((value) => !value),
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
      ? symbols.taskActive
      : current?.status === "blocked"
        ? symbols.warning
        : symbols.taskPending;

  if (!expanded) {
    return (
      <box
        height={1}
        minHeight={1}
        maxHeight={1}
        flexDirection="row"
        justifyContent="space-between"
        paddingX={1}
        flexShrink={0}
      >
        <box flexDirection="row" flexShrink={1}>
          <text fg={color.accent}>{icon} </text>
          <DisclosureIndicator expanded={false} />
          <text fg={color.accent}> </text>
          {current?.status === "in_progress" ? (
            <ShimmerText>{current.title}</ShimmerText>
          ) : (
            <text fg={color.accent}>
              {current?.title ?? "Tasks"}
              {current?.status === "blocked" && current.reason
                ? ` (${current.reason})`
                : ""}
            </text>
          )}
        </box>
        <text fg={color.text.muted}>Tasks {taskProgress(tasks)} · Ctrl+T</text>
      </box>
    );
  }

  return (
    <Panel title={`Tasks ${taskProgress(tasks)}`}>
      <scrollbox
        ref={scrollbox}
        height={5}
        minHeight={0}
        scrollY
        verticalScrollbarOptions={{ visible: false }}
      >
        {tasks.map((task) => (
          <box id={task.id} key={task.id} flexDirection="row">
            <text
              fg={
                task.status === "in_progress"
                  ? color.accent
                  : color.text.secondary
              }
            >
              {task.status === "completed"
                ? symbols.taskCompleted
                : task.status === "in_progress"
                  ? symbols.taskActive
                  : task.status === "blocked"
                    ? symbols.warning
                    : symbols.taskPending}{" "}
            </text>
            {task.status === "in_progress" ? (
              <ShimmerText>{task.title}</ShimmerText>
            ) : (
              <text fg={color.text.secondary}>
                {task.title}
                {task.status === "blocked" && task.reason
                  ? ` (${task.reason})`
                  : ""}
              </text>
            )}
          </box>
        ))}
      </scrollbox>
      <box flexDirection="row">
        <DisclosureIndicator expanded />
        <text fg={color.text.muted}> Ctrl+T collapse</text>
      </box>
    </Panel>
  );
});
