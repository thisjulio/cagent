import {
  workflowEvent,
  type Observability,
  type TurnStatePayload,
} from "@cagent/sdk";
import type { EventBus } from "../events";
import type { Session } from "../session/index";

export type TurnStateHost = {
  bus: EventBus;
  session: Session;
  turnId?: string;
  observability?: Observability;
};

// ADR-0014: synchronous waterfall barrier around a turn's tool phase.
export function runTurnState(
  host: TurnStateHost,
  phase: "before" | "after",
): void {
  const turnId = host.turnId;
  if (!turnId) return;
  const payload = workflowEvent(
    { phase, turnId },
    { sessionId: host.session.id },
  ) as TurnStatePayload;
  try {
    const result = host.bus.waterfall(
      "turn.state",
      payload,
    ) as TurnStatePayload;
    const metadata = result?.data?.sessionMetadata;
    if (!metadata) return;
    for (const record of metadata)
      host.session.append({
        ts: Date.now(),
        turnId,
        type: "meta",
        payload: { kind: "turn-state", ...record },
      });
  } catch (error) {
    // Plugin failure policy: a handler exception must not stop the turn.
    host.observability?.recordEvent("turn.state.error", {
      phase,
      "turn.id": turnId,
      error: String(error),
    });
  }
}
