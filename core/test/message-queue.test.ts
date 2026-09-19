import { describe, expect, test } from "bun:test";
import {
  createQueue,
  drainQueue,
  enqueueMessage,
  markQueueProcessing,
  retainQueueAfterFailure,
} from "../src/controller/message-queue";

describe("message queue", () => {
  test("enqueues messages in FIFO order without mutating prior state", () => {
    const queue = createQueue();
    const first = enqueueMessage(queue, {
      id: "one",
      content: "first",
      submittedAt: 1,
    });
    const second = enqueueMessage(first, {
      id: "two",
      content: "second",
      submittedAt: 2,
    });

    expect(queue).toEqual([]);
    expect(first.map((message) => message.id)).toEqual(["one"]);
    expect(second.map((message) => message.id)).toEqual(["one", "two"]);
    expect(second[0]?.status).toBe("queued");
  });

  test("marks a FIFO group as processing", () => {
    const queue = enqueueMessage(
      enqueueMessage(createQueue(), {
        id: "one",
        content: "first",
        submittedAt: 1,
      }),
      { id: "two", content: "second", submittedAt: 2 },
    );

    const processing = markQueueProcessing(queue);

    expect(processing.map((message) => message.status)).toEqual([
      "processing",
      "processing",
    ]);
    expect(processing.map((message) => message.content)).toEqual([
      "first",
      "second",
    ]);
  });

  test("drains the queue while retaining immutable records for the caller", () => {
    const queue = enqueueMessage(createQueue(), {
      id: "one",
      content: "first",
      submittedAt: 1,
    });

    const result = drainQueue(queue);

    expect(result.messages).toEqual([
      { id: "one", content: "first", submittedAt: 1, status: "processing" },
    ]);
    expect(result.remaining).toEqual([]);
    expect(queue[0]?.status).toBe("queued");
  });

  test("keeps queued messages available after an active turn failure", () => {
    const queue = enqueueMessage(createQueue(), {
      id: "one",
      content: "recover me",
      submittedAt: 1,
    });

    expect(retainQueueAfterFailure(queue)).toEqual(queue);
  });
});
