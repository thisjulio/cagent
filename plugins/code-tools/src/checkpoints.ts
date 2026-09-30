import type {
  PluginCommandContext,
  PluginContext,
  WorkflowEventPayload,
} from "@cagent/sdk";
import { restoreShadow, shadowCommit } from "./git-shadow";
import { syncTracked } from "./state";

export function restoreCheckpoint(context: PluginCommandContext): string {
  if (context.activeTurn)
    throw new Error("Cannot restore during an active turn");
  const arg = context.arguments.trim();
  if (context.name === "undo" && arg) throw new Error("Usage: /undo");
  if (context.name === "rewind" && !/^[1-9]\d*$/.test(arg))
    throw new Error("Usage: /rewind <turn> (positive turn number)");
  if (!context.sessionId || !context.records || !context.restoreConversation)
    throw new Error("Session checkpoint context is unavailable");
  const records = context.records;
  const checkpoints = records.filter(
    (r) => r.payload.kind === "workspace-checkpoint" && r.turnId,
  );
  const turns = [
    ...new Set(records.filter((r) => r.type === "user").map((r) => r.turnId)),
  ];
  const turnId =
    context.name === "undo"
      ? checkpoints.at(-1)?.turnId
      : turns[Number(arg) - 1];
  const selected = checkpoints.findIndex((r) => r.turnId === turnId);
  if (selected < 0) throw new Error("No restorable checkpoint for this turn");
  const affected = checkpoints.slice(selected);
  const last = affected.at(-1);
  const end = records.findLast(
    (r) =>
      r.turnId === last?.turnId &&
      r.payload.kind === "workspace-turn-completed",
  );
  if (!end || typeof end.payload.hash !== "string")
    throw new Error("The turn has no completed checkpoint");
  restoreShadow(String(affected[0].payload.hash), end.payload.hash, () => {
    context.restoreConversation?.(String(turnId), {
      hash: affected[0].payload.hash,
    });
  });
  syncTracked();
  return `Restored conversation and workspace before turn ${turns.indexOf(turnId) + 1}.`;
}

export function registerCheckpoints(ctx: PluginContext): void {
  ctx.on("turn.state", (value: unknown) => {
    const payload = value as WorkflowEventPayload;
    if (!payload.sessionId) return payload;
    const hash = shadowCommit(
      `Session ${payload.sessionId} turn ${String(payload.data.turnId)}`,
    );
    const previous = Array.isArray(payload.data.sessionMetadata)
      ? payload.data.sessionMetadata
      : [];
    const kind =
      payload.data.phase === "before"
        ? "workspace-checkpoint"
        : "workspace-turn-completed";
    return {
      ...payload,
      data: { ...payload.data, sessionMetadata: [...previous, { kind, hash }] },
    };
  });
  for (const name of ["undo", "rewind"])
    ctx.registerCommand({
      name,
      description:
        name === "undo"
          ? "Restore the workspace before the latest turn"
          : "Restore the workspace before a numbered turn",
      execute: restoreCheckpoint,
    });
}
