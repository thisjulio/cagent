import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openStore } from "../src/sqlite-storage";

test("SQLite store persists entries and creates schema", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "memory-sqlite-"));
  const file = path.join(directory, "memory.sqlite");
  const store = openStore(file);
  store.replace({ id: "m1", content: "Use Bun", scope: "project", kind: "convention", status: "approved", confidence: 1, source: "test", project: "/project", createdAt: "2026-01-01", updatedAt: "2026-01-01" });
  expect(store.entries()[0].content).toBe("Use Bun");
  expect(store.lexical("Bun")[0].id).toBe("m1");
  store.replace({ id: "m2", content: "Vector", scope: "project", kind: "fact", status: "approved", confidence: 1, source: "test", project: "/project", embeddingModel: "test-model", embeddingDimension: 2, embedding: [1, 0], createdAt: "2026-01-02", updatedAt: "2026-01-02" });
  expect(store.vector([0.9, 0.1], "test-model")[0].id).toBe("m2");
  store.close();
  expect(fs.existsSync(file)).toBe(true);
  const reopened = openStore(file);
  expect(reopened.entries()).toHaveLength(2);
  reopened.remove("m1");
  expect(reopened.entries()).toHaveLength(1);
  reopened.replace({ id: "m2", content: "Updated", scope: "project", kind: "fact", status: "approved", confidence: 1, source: "test", project: "/project", createdAt: "2026-01-02", updatedAt: "2026-01-03" });
  expect(reopened.entries().find((entry) => entry.id === "m2")?.content).toBe("Updated");
  reopened.close();
});
