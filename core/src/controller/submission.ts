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
import { appendPrompt } from "../session/history";
import {
  appendFileContext,
  buildFileContext,
  withFileContext,
} from "../context/file-mentions";
import { selectRequestWindow } from "../context/request-window";
import { finishPreparingTool, startPreparingTool } from "./tool-preparation";
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

  const { content: imagePrompt, imagePaths } = imageContent;
  const fileMention = /(^|\s)@/.test(text)
    ? await buildFileContext(
        text,
        process.cwd(),
        Math.max(1_000, Math.floor(controller.state.contextWindow * 0.2 * 4)),
      )
    : { content: text.trim() || text, filePaths: [], context: "" };
  const content = appendFileContext(imagePrompt, fileMention.context);
  appendPrompt(process.cwd(), text);
  resetCompletedTasks(controller);
  appendChat(state, {
    kind: "user",
    content: text,
    imagePaths,
    filePaths: fileMention.filePaths,
    turnId,
  });
  state.busy = true;
  state.turnStartedAt = Date.now();
  state.elapsedMs = 0;
  state.currentTurnId = turnId;
  controller.resetTurn();
  controller.session.append({
    ts: Date.now(),
    turnId,
    type: "user",
    payload: {
      content: text,
      imagePaths,
      filePaths: fileMention.filePaths,
    },
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
  if (state.tokens !== undefined) await compactBeforeSubmission(controller);
  const contextContributions = await controller.contextContributions(text);
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
  // ponytail: no 500ms elapsed timer — elapsedMs is write-only mid-turn
  // (nothing renders it live) and each tick re-rendered the whole tree.
  // The final value is still computed in turn.ts when the turn ends.
  await executeTurn({
    state,
    adapter: controller.adapter,
    model: splitRoute(state.model)[1],
    variant: state.variant,
    messages: controller.messages,
    messagesForRequest: (messages) => {
      const preferences = loadPreferences().filter((item) => item.enabled);
      const stableParts = contextContributions.filter(
        (entry) => entry.phase === "stable",
      );
      const turnParts = contextContributions.filter(
        (entry) => entry.phase !== "stable",
      );
      const checkpointEarly = taskCheckpointMessage(controller.state.tasks);
      const estimateText = (text: string): number => Math.ceil(text.length / 4);
      const prefsText = preferences.length
        ? [
            "Persistent user preferences. Follow these instructions in every response. The language of the current message does not override a language preference. Change a preference only when the user explicitly asks to do so. System policies and explicit conflicting requests take precedence:",
            ...preferences.map((item) => `- ${item.text}`),
          ].join("\n")
        : "";
      const extraTokens =
        estimateText(prefsText) +
        stableParts.reduce(
          (sum, entry) => sum + estimateText(entry.content),
          0,
        ) +
        turnParts.reduce((sum, entry) => sum + estimateText(entry.content), 0) +
        estimateText(fileMention.context) +
        estimateText(checkpointEarly ?? "");
      const toolDefs = taskAwareTools(controller);
      const toolTokens = Math.ceil(
        toolDefs.reduce(
          (sum, tool) =>
            sum +
            tool.name.length +
            tool.description.length +
            JSON.stringify(tool.parameters ?? {}).length,
          0,
        ) / 4,
      );
      const window = selectRequestWindow(messages, {
        contextWindow: controller.state.contextWindow,
        toolLimitTokens: controller.config.compact_prune_tool_tokens ?? 2000,
        recentMessages: controller.config.context_recent_messages ?? 24,
        reserveTokens: 8000 + extraTokens,
        toolTokens,
      });
      const budgeted = window.messages;
      const requestMessages = [];
      if (prefsText)
        requestMessages.push({
          role: "system" as const,
          content: prefsText,
        });
      for (const contribution of stableParts)
        requestMessages.push({
          role: "system" as const,
          content: contribution.content,
        });
      if (turnParts.length) {
        const lastUserIndex = budgeted.findLastIndex(
          (message) => message.role === "user",
        );
        const insertionIndex =
          lastUserIndex < 0 ? budgeted.length : lastUserIndex;
        requestMessages.push(...budgeted.slice(0, insertionIndex));
        for (const contribution of turnParts)
          requestMessages.push({
            role: "system" as const,
            content: contribution.content,
          });
        requestMessages.push(...budgeted.slice(insertionIndex));
      } else {
        requestMessages.push(...budgeted);
      }
      controller.bus.emit(
        "prompt.assembled",
        workflowEvent(
          {
            "context.included": window.included,
            "context.omitted": window.omitted,
            "context.recent_turns": window.recentTurns,
          },
          { sessionId: controller.session.id },
        ),
      );
      controller.observability?.recordEvent("prompt.assembled", {
        "context.included": window.included,
        "context.omitted": window.omitted,
        "context.recent_turns": window.recentTurns,
      });
      if (checkpointEarly)
        requestMessages.push({
          role: "user" as const,
          content: checkpointEarly,
        });
      return withFileContext(requestMessages, fileMention.context);
    },
    stablePrefixMessages:
      Number(loadPreferences().some((item) => item.enabled)) +
      contextContributions.filter((entry) => entry.phase === "stable").length +
      controller.messages.filter((message) => message.role === "system").length,
    cacheKey: controller.session.id,
    tools: taskAwareTools(controller),
    allowlist: controller.config.allowlist,
    ask: controller.ask,
    bus: controller.bus,
    readOnly: false,
    hooks: controller.registry.hooks,
    session: controller.session,
    interrupted: () => controller.isInterrupted(),
    signal: controller.signal,
    maxTurns: controller.maxTurns,
    maxToolCalls: controller.maxToolCalls,
    maxInputTokensPerTurn: controller.maxInputTokensPerTurn,
    onText: controller.onText,
    onReasoning: controller.onReasoning,
    onToolCallStart: (toolCall) => {
      if (startPreparingTool(state, toolCall)) controller.bump();
    },
    onToolCallFinished: (id) => {
      if (finishPreparingTool(state, id)) controller.bump();
    },
    bump: controller.bump,
    bumpStream: () => controller.bumpStreamNow(),
    refreshGitInfo: () => controller.gitStatus.refresh(),
    observability: controller.observability,
    turnId,
    onContextLimit: () => {
      if (controller.config.compact_auto === false) {
        notify(controller.state, "automatic compaction disabled; use /compact");
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
    traceAttributes: {
      "turn.id": turnId,
      session_id: controller.session.id,
    },
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
