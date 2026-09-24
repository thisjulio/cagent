import crypto from "node:crypto";
import { appendChat, notify } from "./chat-buffer";
import { addEnvironmentContext } from "./environment";
import { executeTurn } from "./turn";
import { splitRoute } from "../route";
import { resetCompletedTasks, taskAwareTools } from "./task-actions";
import { compact, generateTitle } from "./sessions";
import type { Controller } from "./controller";
import { workflowEvent } from "@cagent/sdk";
import { buildImageContent } from "./submit-image";
import { compactionEventFields } from "./compaction-events";
import { loadPreferences } from "../preferences";
import { taskCheckpointMessage } from "./task-continuation";
export async function submitMessage(
  controller: Controller,
  text: string,
): Promise<void> {
  const state = controller.state;
  const turnId = crypto.randomUUID();
  const imageContent = buildImageContent(text);

  if (imageContent === null) {
    rejectSubmission(controller, "Maximum 5 images per message");
    return;
  }

  const { content, imagePaths } = imageContent;
  resetCompletedTasks(controller);
  appendChat(state, { kind: "user", content: text, imagePaths, turnId });
  state.busy = true;
  state.turnStartedAt = Date.now();
  state.elapsedMs = 0;
  state.currentTurnId = turnId;
  controller.resetTurn();
  controller.session.append({
    ts: Date.now(),
    turnId,
    type: "user",
    payload: { content: text, imagePaths },
  });
  controller.messages.push({ role: "user", content });
  controller.bus.emit(
    "message.submitted",
    workflowEvent({ content: text }, { sessionId: controller.session.id }),
  );
  controller.envStamp = addEnvironmentContext(
    controller.messages,
    controller.envStamp,
  );
  await compactBeforeSubmission(controller);
  controller.bump();
  const titlePromise = state.title
    ? Promise.resolve()
    : generateTitle(controller, text).then((title) => {
        state.title = title;
        controller.session.append({
          ts: Date.now(),
          type: "meta",
          payload: { kind: "title", title },
        });
        controller.bump();
      });
  await titlePromise;
  await controller.registry.hooks.run({
    phase: "user_prompt_submit",
    prompt: text,
  });
  const timer = setInterval(() => {
    if (state.turnStartedAt) {
      state.elapsedMs = Date.now() - state.turnStartedAt;
      controller.bump();
    }
  }, 500);
  try {
    await executeTurn({
      state,
      adapter: controller.adapter,
      model: splitRoute(state.model)[1],
      variant: state.variant,
      messages: controller.messages,
      messagesForRequest: (messages) => {
        const preferences = loadPreferences().filter((item) => item.enabled);
        const requestMessages = [];
        if (preferences.length)
          requestMessages.push({
            role: "system" as const,
            content: [
              "Persistent user preferences. Follow these instructions in every response. The language of the current message does not override a language preference. Change a preference only when the user explicitly asks to do so. System policies and explicit conflicting requests take precedence:",
              ...preferences.map((item) => `- ${item.text}`),
            ].join("\n"),
          });
        const taskCheckpoint = taskCheckpointMessage(controller.state.tasks);
        if (taskCheckpoint)
          requestMessages.push({
            role: "system" as const,
            content: taskCheckpoint,
          });
        requestMessages.push(...messages);
        controller.bus.emit(
          "prompt.assembled",
          workflowEvent(
            {
              "context.included": messages.length,
              "context.omitted": 0,
              "context.recent_turns": 0,
            },
            { sessionId: controller.session.id },
          ),
        );
        controller.observability?.recordEvent("prompt.assembled", {
          "context.included": messages.length,
          "context.omitted": 0,
          "context.recent_turns": 0,
        });
        return requestMessages;
      },
      tools: taskAwareTools(controller),
      allowlist: controller.config.allowlist,
      ask: controller.ask,
      bus: controller.bus,
      readOnly: controller.readOnly,
      hooks: controller.registry.hooks,
      session: controller.session,
      interrupted: () => controller.isInterrupted(),
      signal: controller.signal,
      maxTurns: controller.maxTurns,
      maxToolCalls: controller.maxToolCalls,
      onText: controller.onText,
      onReasoning: controller.onReasoning,
      bump: controller.bump,
      bumpStream: () => controller.bumpStreamNow(),
      observability: controller.observability,
      turnId,
      onContextLimit: () => {
        if (controller.config.compact_auto === false) {
          notify(
            controller.state,
            "automatic compaction disabled; use /compact",
          );
          return Promise.resolve();
        }
        controller.observability?.recordEvent("compaction.requested", {
          ...compactionEventFields(controller.state, controller.state.model),
          reason: "provider_context_limit",
          error: controller.state.notice,
        });
        return compact(controller, true);
      },
      compactIfNeeded: async () => {
        if (
          controller.config.compact_auto !== false &&
          (controller.state.tokens ?? 0) >= controller.state.threshold
        ) {
          controller.observability?.recordEvent("compaction.requested", {
            ...compactionEventFields(controller.state, controller.state.model),
            reason: "threshold_during_turn",
          });
          await compact(controller);
        }
      },
      traceAttributes: { "turn.id": turnId },
      verification: controller.verification,
      continueTurn: async () => {
        const queued = controller.takeQueuedMessages();
        const message = queued[0];
        if (!message) return false;
        controller.restoreQueuedMessages(queued.slice(1));
        controller.removeQueuedChatMessage(message.id);
        controller.session.append({
          ts: Date.now(),
          turnId,
          type: "meta",
          payload: { kind: "queued-message-processing", id: message.id },
        });
        controller.messages.push({ role: "user", content: message.content });
        controller.session.append({
          ts: Date.now(),
          turnId,
          type: "user",
          payload: { content: message.content },
        });
        appendChat(state, {
          kind: "user",
          content: message.content,
          turnId,
        });
        return true;
      },
      shouldYield: () => controller.queuedMessages().length > 0,
    });
  } finally {
    clearInterval(timer);
  }
}

async function compactBeforeSubmission(controller: Controller): Promise<void> {
  const { config, state } = controller;
  if (config.compact_auto === false || (state.tokens ?? 0) < state.threshold)
    return;
  try {
    await compact(controller);
  } catch (error) {
    notify(
      state,
      `compaction failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function rejectSubmission(controller: Controller, message: string): void {
  notify(controller.state, message);
}
