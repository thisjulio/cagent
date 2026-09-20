import type { SessionRecord } from "../session/index";
import type { Task } from "./model";

export function restoreTasks(records: SessionRecord[]): Task[] {
  const record = records.findLast(
    (item) => item.type === "meta" && item.payload.kind === "tasks",
  );
  return (record?.payload.tasks as Task[] | undefined) ?? [];
}

export function appendTasks(
  session: { append: (record: SessionRecord) => void },
  tasks: Task[],
): void {
  session.append({
    ts: Date.now(),
    type: "meta",
    payload: { kind: "tasks", tasks },
  });
}
