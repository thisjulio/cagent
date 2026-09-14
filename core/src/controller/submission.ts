import crypto from "node:crypto";
import { appendChat } from "./chat-buffer";
import { addEnvironmentContext } from "./environment";
import { executeTurn } from "./turn";
import { splitRoute } from "../route";
import { resetCompletedTasks, taskAwareTools } from "./task-actions";
import { compact, generateTitle } from "./sessions";
import type { Controller } from "./controller";
import { workflowEvent } from "@cagent/sdk";

export async function submitMessage(controller: Controller, text: string): Promise<void> {
  const state = controller.state;
  const turnId = crypto.randomUUID();
  resetCompletedTasks(controller);
  appendChat(state, { kind: "user", content: text });
  state.busy = true;
  state.turnStartedAt = Date.now();
  state.elapsedMs = 0;
  controller.resetTurn();
  controller.session.append({ ts: Date.now(), type: "user", payload: { content: text } });
  controller.messages.push({ role: "user", content: text });
  controller.bus.emit("message.submitted", workflowEvent({ content: text }, { sessionId: controller.session.id }));
  controller.envStamp = addEnvironmentContext(controller.messages, controller.envStamp);
  state.tokens = controller.estimateCurrentTokens();
  if (controller.config.compact_auto !== false && controller.estimateCurrentTokens() >= state.threshold) {
    try { await compact(controller); } catch (error) { state.notice = `compaction failed: ${error instanceof Error ? error.message : String(error)}`; }
  }
  controller.bump();
  const titlePromise = state.title ? Promise.resolve() : generateTitle(controller, text).then((title) => {
    state.title = title;
    controller.session.append({ ts: Date.now(), type: "meta", payload: { kind: "title", title } });
    controller.bump();
  });
  await titlePromise;
  const timer = setInterval(() => { if (state.turnStartedAt) { state.elapsedMs = Date.now() - state.turnStartedAt; controller.bump(); } }, 500);
  await executeTurn({ state, adapter: controller.adapter, model: splitRoute(state.model)[1], messages: controller.messages, tools: taskAwareTools(controller), allowlist: controller.config.allowlist, ask: controller.ask, bus: controller.bus, hooks: controller.registry.hooks, session: controller.session, interrupted: () => controller.isInterrupted(), signal: controller.signal, maxTurns: controller.maxTurns, maxToolCalls: controller.maxToolCalls, onText: controller.onText, onReasoning: controller.onReasoning, bump: controller.bump, bumpStream: () => controller.bumpStreamNow(), observability: controller.observability, onContextLimit: () => {
    if (controller.config.compact_auto === false) {
      controller.state.notice = "automatic compaction disabled; use /compact";
      controller.bump();
      return Promise.resolve();
    }
    return compact(controller, true);
  }, traceAttributes: { "turn.id": turnId } }).finally(() => clearInterval(timer));
}