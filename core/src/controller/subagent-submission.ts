import crypto from "node:crypto";
import type { Controller } from "./controller";
import { appendChat } from "./chat-buffer";

export async function submitSubagent(
  controller: Controller,
  name: string,
  task: string,
  original: string,
): Promise<void> {
  const turnId = crypto.randomUUID();
  controller.observability?.recordEvent("subagent.started", {
    "subagent.name": name,
    "task.length": task.length,
  });
  const s = controller.state;
  s.input = "";
  appendChat(s, { kind: "user", content: original });
  controller.session.append({
    ts: Date.now(),
    turnId,
    type: "user",
    payload: { content: original },
  });
  controller.session.append({
    ts: Date.now(),
    type: "meta",
    payload: { kind: "subagent-start", name },
  });
  appendChat(s, {
    kind: "assistant",
    content: "",
    subagent: name,
    subagentHeader: true,
  });
  await controller.registry.hooks.run({
    phase: "subagent_start",
    subagent: name,
    task,
  });
  s.busy = true;
  s.turnStartedAt = Date.now();
  controller.bump();
  try {
    if (!controller.invokeSubagent)
      throw new Error("subagent runtime is unavailable");
    const result = await controller.invokeSubagent({
      name,
      task,
      context: controller.messages.slice(),
    });
    controller.observability?.recordEvent("subagent.completed", {
      "subagent.name": name,
      "result.length": result.length,
    });
    controller.messages.push(
      { role: "user", content: original },
      { role: "assistant", content: result },
    );
    appendChat(s, { kind: "assistant", content: result, subagent: name });
    controller.session.append({
      ts: Date.now(),
      turnId,
      type: "assistant",
      payload: { content: result, subagent: name },
    });
  } catch (error) {
    controller.observability?.recordEvent("subagent.failed", {
      "subagent.name": name,
      "error.type": error instanceof Error ? error.name : "unknown",
    });
    s.notice = `error: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    s.busy = false;
    s.turnStartedAt = null;
    s.elapsedMs = 0;
    controller.bump();
  }
}
