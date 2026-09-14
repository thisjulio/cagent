import { expect, test } from "bun:test";
import { extractArchitectureCandidates } from "../src/architecture-learning";

test("extracts approved architecture convention after cross-source confirmation", () => {
  const candidates = extractArchitectureCandidates(
    "The message flow always routes through the controller.",
    [{ path: "core/src/controller/submission.ts", kind: "code" }, { path: "core/test/controller.test.ts", kind: "test" }],
    [],
  );
  expect(candidates[0]).toMatchObject({ kind: "convention", status: "approved", confidence: 0.95 });
  expect(candidates[0].evidence).toHaveLength(2);
});

test("keeps single-source architecture inference pending", () => {
  const candidates = extractArchitectureCandidates("Our architecture routes through the controller.", [{ path: "core/src/controller/submission.ts", kind: "code" }], []);
  expect(candidates[0].status).toBe("pending");
});
