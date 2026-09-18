import { expect, test } from "bun:test";
import { EventBus } from "../src/events";
import { workflowEvent } from "@cagent/sdk";

test("workflow events preserve versioned payloads through EventBus", () => {
  const bus = new EventBus();
  let received: unknown;
  bus.onWorkflow("turn.completed", (payload) => {
    received = payload;
  });
  const event = workflowEvent(
    { content: "done" },
    { sessionId: "s1", projectId: "p1" },
  );
  bus.emitWorkflow("turn.completed", event);
  expect(received).toEqual(event);
});
