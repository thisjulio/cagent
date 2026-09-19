export type QueueMessage = {
  id: string;
  content: string;
  submittedAt: number;
  status: "queued" | "processing";
};

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
