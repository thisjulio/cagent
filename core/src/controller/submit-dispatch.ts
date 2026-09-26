import crypto from "node:crypto";
import { runSlash } from "../commands/commands";
import { parseSubagentMention } from "../subagents/mention";
import { appendChat, notify } from "./chat-buffer";
import { enqueueMessage } from "./message-queue";
import type { Controller } from "./controller";

type SubmissionActions = {
  submitMessage: (controller: Controller, text: string) => Promise<void>;
  submitShell: (controller: Controller, command: string) => Promise<void>;
  submitSubagent: (
    controller: Controller,
    name: string,
    task: string,
    originalText: string,
  ) => Promise<void>;
};

export async function submitText(
  controller: Controller,
  text: string,
  actions: SubmissionActions,
): Promise<void> {
  if (!text || !controller.state.model) return;
  if (controller.state.busy) {
    const message = {
      id: crypto.randomUUID(),
      content: text,
      submittedAt: Date.now(),
      status: "queued" as const,
    };
    const queued = controller.queuedMessages();
    const nextQueue = enqueueMessage(queued, message);
    if (nextQueue.length === queued.length) {
      notify(controller.state, "queued input limit reached");
      return;
    }
    controller.enqueueMessage(message);
    controller.state.input = "";
    controller.state.inputKey += 1;
    controller.session.append({
      ts: message.submittedAt,
      turnId: controller.state.currentTurnId,
      type: "meta",
      payload: { kind: "queued-message", ...message, status: "queued" },
    });
    appendChat(controller.state, {
      kind: "user",
      content: text,
      queueStatus: "queued",
      queueMessageId: message.id,
      turnId: controller.state.currentTurnId,
    });
    controller.bump();
    return;
  }
  controller.state.input = "";
  controller.state.inputKey += 1;
  if (text.startsWith("$") && text.slice(1).trim()) {
    await actions.submitShell(controller, text.slice(1).trim());
    return;
  }
  if (text.startsWith("/")) {
    await runSlash(controller, text);
    return;
  }
  const mention = parseSubagentMention(text);
  if (mention && controller.registry.subagent(mention.name)) {
    await actions.submitSubagent(controller, mention.name, mention.task, text);
    return;
  }
  await actions.submitMessage(controller, text);
}
