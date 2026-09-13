import { expect, test } from "bun:test";
import { EventBus } from "../src/events";

test("plugin activity events carry visible content", () => {
  const bus = new EventBus(); let received: unknown;
  bus.on("plugin/activity", (payload) => { received = payload; });
  bus.emit("plugin/activity", { plugin: "memory-local", content: "1 memory suggestion created (pending approval)" });
  expect(received).toEqual({ plugin: "memory-local", content: "1 memory suggestion created (pending approval)" });
});
