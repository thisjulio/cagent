import { expect, test } from "bun:test";
import { onKey } from "../src/controller/keys";

test("Enter toggles details for the latest pending memory", () => {
  let toggled = 0;
  const controller = { state: { chat: [{ kind: "memory", memoryStatus: "pending" }] }, toggleMemoryDetails: () => { toggled++; } } as never;
  onKey(controller, { return: true }, "");
  expect(toggled).toBe(1);
});
