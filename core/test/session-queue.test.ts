import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Session } from "../src/session";

describe("session queued messages", () => {
  test("restores queued message records and preserves FIFO status", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cagent-queue-"));
    const session = new Session("queue-session", directory);
    session.append({
      ts: 1,
      turnId: "turn-1",
      type: "meta",
      payload: {
        kind: "queued-message",
        id: "one",
        content: "first",
        submittedAt: 1,
        status: "queued",
      },
    });
    session.append({
      ts: 2,
      turnId: "turn-1",
      type: "meta",
      payload: {
        kind: "queued-message",
        id: "two",
        content: "second",
        submittedAt: 2,
        status: "processing",
      },
    });
    session.append({
      ts: 3,
      turnId: "turn-1",
      type: "meta",
      payload: { kind: "queued-message-completed", id: "one" },
    });
    session.append({
      ts: 4,
      turnId: "turn-1",
      type: "meta",
      payload: { kind: "queued-message-processing", id: "two" },
    });

    const loaded = session.load();

    expect(loaded.queuedMessages).toEqual([
      { id: "two", content: "second", submittedAt: 2, status: "queued" },
    ]);
  });

  test("rejects path traversal session ids", () => {
    expect(() => new Session("../outside")).toThrow("Invalid session id");
  });
});
