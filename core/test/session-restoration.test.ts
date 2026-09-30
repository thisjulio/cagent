import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "bun:test";
import { Session } from "../src/session/index";
import { projectSessionRecords } from "../src/session/records";
import type { SessionRecord } from "../src/session/types";

const directories: string[] = [];
afterEach(() => {
  for (const dir of directories.splice(0))
    fs.rmSync(dir, { recursive: true, force: true });
});
function session(): Session {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "restore-session-"));
  directories.push(dir);
  return new Session(undefined, dir);
}
function turn(s: Session, id: string): void {
  s.append({
    ts: 1,
    turnId: id,
    type: "meta",
    payload: { kind: "workspace-checkpoint" },
  });
  s.append({ ts: 2, turnId: id, type: "user", payload: { content: id } });
  s.append({
    ts: 3,
    turnId: id,
    type: "assistant",
    payload: { content: `answer ${id}` },
  });
}
function persisted(s: Session): SessionRecord[] {
  return fs
    .readFileSync(s.file, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}

test("repeated undo and new turns retain only the active branch after reload", () => {
  const s = session();
  turn(s, "one");
  turn(s, "two");
  s.restoreBefore("two", {});
  turn(s, "three");
  s.restoreBefore("three", {});
  turn(s, "four");
  s.restoreBefore("one", {});
  turn(s, "five");
  const projected = projectSessionRecords(persisted(s));
  expect(
    projected
      .filter((record) => record.type === "user")
      .map((record) => record.turnId),
  ).toEqual(["five"]);
  const reopened = new Session(s.id, path.dirname(s.file));
  expect(reopened.history()).toEqual(projected);
  expect(reopened.load().messages).toEqual([
    { role: "user", content: "five" },
    { role: "assistant", content: "answer five" },
  ]);
  expect(
    persisted(s).filter((record) => record.payload.kind === "session-restored"),
  ).toHaveLength(3);
});

test("rewind before a compacted boundary restores original messages through Session.load", () => {
  const s = session();
  turn(s, "one");
  turn(s, "two");
  s.append({
    ts: 4,
    turnId: "two",
    type: "meta",
    payload: { kind: "compacted", summary: "old context" },
  });
  turn(s, "three");
  expect(s.load().messages[0]?.content).toContain("old context");
  s.restoreBefore("two", {});
  const reopened = new Session(s.id, path.dirname(s.file));
  expect(reopened.load().messages).toEqual([
    { role: "user", content: "one" },
    { role: "assistant", content: "answer one" },
  ]);
  expect(
    reopened
      .load()
      .records.some((record) => record.payload.kind === "compacted"),
  ).toBe(false);
  expect(projectSessionRecords(persisted(s))).toEqual(reopened.history());
});

test("restoration rejects metadata-only targets without writing an invalid boundary", () => {
  const s = session();
  turn(s, "one");
  s.append({
    ts: 4,
    turnId: "metadata-only",
    type: "meta",
    payload: { kind: "tasks", tasks: [] },
  });
  const original = fs.readFileSync(s.file, "utf8");
  expect(() => s.restoreBefore("metadata-only", {})).toThrow();
  expect(fs.readFileSync(s.file, "utf8")).toBe(original);
  expect(() => s.load()).not.toThrow();
});
