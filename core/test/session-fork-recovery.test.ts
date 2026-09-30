import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "bun:test";
import { Session } from "../src/session";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    fs.rmSync(directory, { recursive: true, force: true });
});
function create(): Session {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "session-fork-"));
  directories.push(directory);
  return new Session(undefined, directory);
}
function queue(session: Session): void {
  session.append({
    ts: 1,
    type: "meta",
    payload: {
      kind: "queued-message",
      id: "q",
      content: "next",
      submittedAt: 1,
    },
  });
}

test("queue survives interruption before checkpoint and before the user commit", () => {
  const session = create();
  queue(session);
  session.append({
    ts: 2,
    type: "meta",
    payload: { kind: "queued-message-processing", id: "q" },
  });
  expect(session.load().queuedMessages).toHaveLength(1);
  session.append({
    ts: 3,
    turnId: "turn",
    type: "meta",
    payload: { kind: "workspace-checkpoint", hash: "opaque" },
  });
  expect(session.load().queuedMessages).toHaveLength(1);
  fs.appendFileSync(session.file, '{"type":"user","payload":');
  expect(session.load().queuedMessages).toHaveLength(1);
  session.append({
    ts: 4,
    turnId: "turn",
    type: "user",
    payload: { content: "next", queuedMessageId: "q" },
  });
  expect(session.load().queuedMessages).toEqual([]);
  expect(session.load().messages).toEqual([{ role: "user", content: "next" }]);
});

test("compaction does not hide pending queue or model selection", () => {
  const session = create();
  queue(session);
  session.appendModelSelection({ model: "provider/model" });
  session.append({
    ts: 2,
    type: "meta",
    payload: {
      kind: "checkpoint",
      checkpoint: { version: 1, summary: "summary", recentMessages: [] },
    },
  });
  expect(session.load().queuedMessages).toHaveLength(1);
  expect(session.load().modelSelection?.model).toBe("provider/model");
});

test("fork copies active canonical metadata and partial response independently", () => {
  const session = create();
  queue(session);
  session.append({
    ts: 2,
    turnId: "one",
    type: "meta",
    payload: {
      kind: "workspace-checkpoint",
      hash: "opaque",
      nested: { value: 1 },
    },
  });
  session.append({
    ts: 3,
    turnId: "one",
    type: "user",
    payload: { content: "one" },
  });
  session.appendAssistantSnapshot("one", "partial");
  const fork = session.fork();
  expect(fork.id).not.toBe(session.id);
  expect(fork.history().slice(0, -1)).toEqual(session.history());
  expect(fork.load()).toEqual(session.load());
  session.clearAssistantSnapshot();
  session.restoreBefore("one", {});
  expect(fork.load().messages.at(-1)?.content).toBe("partial");
  fork.append({
    ts: 4,
    turnId: "two",
    type: "user",
    payload: { content: "fork only" },
  });
  expect(session.load().messages).toEqual([]);
});

test("fork excludes abandoned turns while retaining pre-compaction history", () => {
  const session = create();
  session.append({
    ts: 1,
    turnId: "one",
    type: "user",
    payload: { content: "one" },
  });
  session.append({
    ts: 2,
    turnId: "one",
    type: "meta",
    payload: { kind: "compacted", summary: "summary" },
  });
  session.append({
    ts: 3,
    turnId: "two",
    type: "user",
    payload: { content: "two" },
  });
  session.restoreBefore("two", {});
  const fork = session.fork();
  expect(fork.history()).toEqual(session.history());
  expect(fork.load()).toEqual(session.load());
  fork.restoreBefore("one", {});
  expect(fork.load().messages).toEqual([]);
});
