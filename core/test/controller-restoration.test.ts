import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, spyOn, test } from "bun:test";
import { Controller } from "../src/controller/controller";
import type { ControllerDeps } from "../src/controller/state";
import { restoreConversation } from "../src/controller/restoration";
import { EventBus } from "../src/events";
import { Registry } from "../src/registry";

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
