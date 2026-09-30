import type { Controller } from "./controller";
import { toChatItems } from "./sessions";
import { mergeSystemMessages } from "../message-context";
import {
  effectiveSessionRecords,
  projectSessionRecords,
} from "../session/records";
import { recordsToMessages } from "../session/messages";
import { restoreQueue } from "../session/queue";
import { restoreTasks } from "../tasks";

/** Rebuild all turn-derived state from the durable active projection. */
export function restoreConversation(
  c: Controller,
  turnId: string,
  metadata: Record<string, unknown>,
): void {
  // Prepare the projection before committing; loading after commit is read-only.
  const history = projectSessionRecords([
    ...c.session.history(),
    {
      ts: Date.now(),
      type: "meta",
      payload: { kind: "session-restored", beforeTurnId: turnId },
    },
  ]);
  const records = effectiveSessionRecords(history);
  const loaded = {
    records,
    messages: recordsToMessages(records),
    queuedMessages: restoreQueue(history),
  };
  const messages = mergeSystemMessages(c.systemPrompt ?? "", loaded.messages);
  const chat = toChatItems(records);
  const tasks = restoreTasks(records);
  c.session.restoreBefore(turnId, metadata);
  c.messages = messages;
  c.state.chat = chat;
  c.state.chatVersion += 1;
  c.state.tasks = tasks;
  c.takeQueuedMessages();
  c.restoreQueuedMessages(loaded.queuedMessages);
  c.state.currentTurnId =
    loaded.records.findLast((record) => record.type === "user")?.turnId ??
    undefined;
  c.state.toolLog = [];
  c.state.tokens = undefined;
  c.state.inputTokens = undefined;
  c.state.outputTokens = undefined;
  c.state.cacheReadTokens = 0;
  c.state.cacheCreationTokens = 0;
  c.state.providerUsage = [];
  c.state.usageTotals = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
  };
  c.state.lastTurnTokensPerSecond = undefined;
  c.state.lastTurnTimeToFirstTokenMs = undefined;
  c.state.lastTurnPromptTokensCached = undefined;
  c.state.turnStartedAt = null;
  c.state.elapsedMs = 0;
  c.envStamp = 0;
  c.stableContext.clear();
  c.resetTurn();
}
