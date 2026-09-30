import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, spyOn, test } from "bun:test";
import { Controller } from "../src/controller/controller";
import type { ControllerDeps } from "../src/controller/state";
import { restoreConversation } from "../src/controller/restoration";
import { EventBus } from "../src/events";
import { Registry } from "../src/registry";
import { submitMessage } from "../src/controller/submission";

const directories: string[] = [];
afterEach(() => {
  for (const dir of directories.splice(0))
    fs.rmSync(dir, { recursive: true, force: true });
});
function controller(): Controller {
  const sessionDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "restore-controller-"),
  );
  directories.push(sessionDir);
  return new Controller({
    config: {
      plugins: [],
      allowlist: [],
      model: "stub/model",
      permissions: false,
    } as ControllerDeps["config"],
    registry: new Registry(),
    bus: new EventBus(),
    model: "stub/model",
    systemPrompt: "system",
    sessionDir,
    adapter: {
      list_models: async () => ["model"],
      prepare_call: async (options) => options,
      stream: async function* () {
        yield { type: "text", text: "answer" };
      },
    },
  });
}

test("failed queued checkpoint leaves the message retryable on resume", async () => {
  const c = controller();
  c.session.append({
    ts: 1,
    type: "meta",
    payload: {
      kind: "queued-message",
      id: "pending",
      content: "follow up",
      submittedAt: 1,
    },
  });
  c.bus.on("turn.state", () => {
    throw new Error("checkpoint failed");
  });
  await expect(submitMessage(c, "follow up", "pending")).rejects.toThrow(
    "checkpoint failed",
  );
  expect(c.session.load().queuedMessages.map((message) => message.id)).toEqual([
    "pending",
  ]);
});
function seed(c: Controller): void {
  for (const turnId of ["first", "second"])
    c.session.append({
      ts: 1,
      turnId,
      type: "user",
      payload: { content: turnId },
    });
  c.enqueueMessage({
    id: "queued",
    content: "pending",
    submittedAt: 1,
    status: "queued",
  });
}

test("projection failure leaves durable history and controller state untouched", () => {
  const c = controller();
  seed(c);
  const durable = fs.readFileSync(c.session.file, "utf8");
  const messages = c.messages;
  const state = JSON.stringify(c.state);
  const history = spyOn(c.session, "history").mockReturnValue([
    {
      ts: 1,
      turnId: "first",
      type: "user",
      payload: {
        content: {
          toString() {
            throw new Error("projection failed");
          },
        },
      },
    },
    { ts: 2, turnId: "second", type: "user", payload: { content: "second" } },
  ]);
  try {
    expect(() => restoreConversation(c, "second", {})).toThrow(
      "projection failed",
    );
  } finally {
    history.mockRestore();
  }
  expect(fs.readFileSync(c.session.file, "utf8")).toBe(durable);
  expect(c.messages).toBe(messages);
  expect(JSON.stringify(c.state)).toBe(state);
  expect(c.queuedMessages()).toHaveLength(1);
});

test("durable write failure rolls back history without publishing prepared state", () => {
  const c = controller();
  seed(c);
  const durable = fs.readFileSync(c.session.file, "utf8");
  const messages = c.messages;
  const state = JSON.stringify(c.state);
  const originalWrite = fs.writeSync;
  const write = spyOn(fs, "writeSync").mockImplementation((fd) => {
    originalWrite(fd, "partial restoration record");
    throw new Error("write failed");
  });
  try {
    expect(() => restoreConversation(c, "second", {})).toThrow("write failed");
  } finally {
    write.mockRestore();
  }
  expect(fs.readFileSync(c.session.file, "utf8")).toBe(durable);
  expect(c.messages).toBe(messages);
  expect(JSON.stringify(c.state)).toBe(state);
  expect(c.queuedMessages()).toHaveLength(1);
});

test("queued submissions persist ordered before and after checkpoints for each turn", async () => {
  const c = controller();
  let queued = false;
  c.bus.on("turn.state", (raw) => {
    const payload = raw as {
      data: { phase: string; turnId: string; sessionMetadata?: object[] };
    };
    return {
      ...payload,
      data: {
        ...payload.data,
        sessionMetadata: [
          { kind: "workspace-checkpoint", phase: payload.data.phase },
        ],
      },
    };
  });
  c.adapter.stream = async function* () {
    if (!queued) {
      queued = true;
      await c.submit("follow up");
    }
    yield { type: "text", text: "answer" };
  };
  await c.submit("initial");
  const records = c.session.history();
  const users = records.filter((record) => record.type === "user");
  expect(users.map((record) => record.payload.content)).toEqual([
    "initial",
    "follow up",
  ]);
  for (const user of users) {
    const turn = records.filter((record) => record.turnId === user.turnId);
    const checkpoints = turn.filter(
      (record) => record.payload.kind === "workspace-checkpoint",
    );
    expect(checkpoints.map((record) => record.payload.phase)).toEqual([
      "before",
      "after",
    ]);
    expect(turn.indexOf(checkpoints[0]!)).toBeLessThan(turn.indexOf(user));
    expect(turn.indexOf(checkpoints[1]!)).toBeGreaterThan(
      turn.findIndex((record) => record.type === "assistant"),
    );
  }
  expect(
    records.some(
      (record) => record.payload.kind === "queued-message-processing",
    ),
  ).toBe(true);
  expect(c.queuedMessages()).toEqual([]);
  expect(c.session.load().queuedMessages).toEqual([]);
  const queuedTurn = users[1]!;
  const completion = records.findIndex(
    (record) => record.type === "user" && record.payload.queuedMessageId,
  );
  const boundary = records.findIndex(
    (record) =>
      record.turnId === queuedTurn.turnId &&
      record.payload.kind === "workspace-checkpoint",
  );
  expect(completion).toBeGreaterThan(boundary);
  restoreConversation(c, queuedTurn.turnId!, {});
  expect(c.queuedMessages().map((message) => message.content)).toEqual([
    "follow up",
  ]);
  expect(
    c.session.load().queuedMessages.map((message) => message.content),
  ).toEqual(["follow up"]);
});
