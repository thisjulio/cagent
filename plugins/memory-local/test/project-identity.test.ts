import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fallbackProjectId, projectIdentity } from "../src/project-identity";

test("project identity uses a stable non-git fallback", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "memory-project-"));
  expect(projectIdentity(directory)).toContain(`path:${path.resolve(directory)}`);
  expect(fallbackProjectId(directory)).toHaveLength(24);
  expect(fallbackProjectId(directory)).toBe(fallbackProjectId(directory));
});
