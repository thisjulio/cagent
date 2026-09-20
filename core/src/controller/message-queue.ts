import type { QueueMessage } from "../session/index";

export type QueueInput = Omit<QueueMessage, "status">;

export type DrainResult = {
  messages: QueueMessage[];
  remaining: QueueMessage[];
};

export const MAX_QUEUED_MESSAGES = 100;
export const MAX_QUEUED_MESSAGE_BYTES = 64 * 1024;
export const MAX_QUEUE_BYTES = 1024 * 1024;

export function messageBytes(message: QueueInput): number {
  return Buffer.byteLength(message.content, "utf8");
}

export function createQueue(): QueueMessage[] {
  return [];
}

export function enqueueMessage(
  queue: readonly QueueMessage[],
  message: QueueInput,
): QueueMessage[] {
  if (
    queue.length >= MAX_QUEUED_MESSAGES ||
    messageBytes(message) > MAX_QUEUED_MESSAGE_BYTES ||
    queue.reduce((total, entry) => total + messageBytes(entry), 0) +
      messageBytes(message) >
      MAX_QUEUE_BYTES
  )
    return [...queue];
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
