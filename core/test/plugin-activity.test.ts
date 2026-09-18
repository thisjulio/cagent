import { expect, test } from "bun:test";
import { EventBus } from "../src/events";

test("plugin activity events carry visible content", () => {
  const bus = new EventBus();
  let received: unknown;
  bus.on("plugin/activity", (payload) => {
    received = payload;
  });
  const memory = {
    id: "m1",
    content: "Use bun test",
    scope: "project",
    kind: "convention",
  };
  bus.emit("plugin/activity", {
    plugin: "memory-local",
    content: "memory suggestion created",
    attributes: { memory },
  });
  expect(received).toEqual({
    plugin: "memory-local",
    content: "memory suggestion created",
    attributes: { memory },
  });
});
