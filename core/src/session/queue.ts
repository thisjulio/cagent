import type {
  QueueMessage,
  SessionModelSelection,
  SessionRecord,
} from "./types";

export function restoreQueue(records: SessionRecord[]): QueueMessage[] {
  const queued: QueueMessage[] = [];
  for (const record of records) {
    if (record.type !== "meta") continue;
    const payload = record.payload;
    const id = String(payload.id ?? "");
    if (payload.kind === "queued-message") {
      queued.push({
        id,
        content: String(payload.content ?? ""),
        submittedAt: Number(payload.submittedAt ?? record.ts),
        status: payload.status === "processing" ? "processing" : "queued",
      });
    } else if (payload.kind === "queued-message-failed") {
      updateQueueStatus(queued, id, "queued");
    } else if (payload.kind === "queued-message-processing") {
      updateQueueStatus(queued, id, "processing");
    } else if (payload.kind === "queued-message-completed") {
      const index = queued.findIndex((message) => message.id === id);
      if (index !== -1) queued.splice(index, 1);
    }
  }
  for (const message of queued) message.status = "queued";
  return queued;
}

export function restoreModelSelection(
  records: SessionRecord[],
): SessionModelSelection | undefined {
  let selection: SessionModelSelection | undefined;
  for (const record of records) {
    const payload = record.payload;
    if (
      record.type === "meta" &&
      payload.kind === "model-selection" &&
      typeof payload.model === "string" &&
      payload.model
    ) {
      selection = {
        model: payload.model,
        ...(typeof payload.variant === "string"
          ? { variant: payload.variant }
          : {}),
      };
    }
  }
  return selection;
}

function updateQueueStatus(
  queued: QueueMessage[],
  id: string,
  status: QueueMessage["status"],
): void {
  const message = queued.find((entry) => entry.id === id);
  if (message) message.status = status;
}
