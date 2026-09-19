import type { QueueMessage } from "../session";

export type QueueInput = Omit<QueueMessage, "status">;

export type DrainResult = {
  messages: QueueMessage[];
  remaining: QueueMessage[];
};

export function createQueue(): QueueMessage[] {
  return [];
}

export function enqueueMessage(
  queue: readonly QueueMessage[],
  message: QueueInput,
): QueueMessage[] {
  return [...queue, { ...message, status: "queued" }];
}

export function markQueueProcessing(
  queue: readonly QueueMessage[],
): QueueMessage[] {
  return queue.map((message) => ({ ...message, status: "processing" }));
}

export function drainQueue(queue: readonly QueueMessage[]): DrainResult {
  return {
    messages: markQueueProcessing(queue),
    remaining: [],
  };
}

export function retainQueueAfterFailure(
  queue: readonly QueueMessage[],
): QueueMessage[] {
  return queue.map((message) => ({ ...message }));
}

export function queueContents(queue: readonly QueueMessage[]): string {
  return queue.map((message) => message.content).join("\n");
}
