import { expect, test } from "bun:test";
import { parseLearningDecision } from "../src/learning-decision";

test("accepts an agent-subjective durable learning decision", () => {
  const decision = parseLearningDecision("Memory: The submission flow routes through Controller.submit. Kind: convention", [{ path: "core/src/controller/submission.ts", kind: "code" }, { path: "core/test/loop.test.ts", kind: "test" }]);
  expect(decision).toMatchObject({ shouldPersist: true, scope: "project", kind: "convention", status: "approved" });
});

test("rejects an explicit non-memory conclusion", () => {
  const decision = parseLearningDecision("Memory: do not remember this temporary hypothesis.", [{ path: "core/src/loop.ts", kind: "code" }]);
  expect(decision?.shouldPersist).toBe(false);
});
