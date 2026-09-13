import { expect, test } from "bun:test";
import { orderContextExtensions } from "../src/context-extension";

test("context extension ordering is deterministic", () => {
  const extensions = orderContextExtensions([
    { id: "b", phase: "prompt", priority: 1, contribute: async () => ({ content: "b", source: "b" }) },
    { id: "a", phase: "prompt", priority: 1, contribute: async () => ({ content: "a", source: "a" }) },
  ]);
  expect(extensions.map((extension) => extension.id)).toEqual(["a", "b"]);
});
