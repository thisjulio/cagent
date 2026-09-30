import { workflowEvent } from "@cagent/sdk";
import type { Controller } from "./controller";

// A synchronous waterfall is an ordered barrier before tools run and after they stop.
export function persistWorkflowState(
  controller: Controller,
  phase: "before" | "after",
  turnId: string,
): void {
  const result = controller.bus.waterfall(
    "turn.state",
    workflowEvent({ phase, turnId }, { sessionId: controller.session.id }),
  ) as { data?: Record<string, unknown> };
  const metadata = result.data?.sessionMetadata;
  if (!Array.isArray(metadata)) return;
  for (const payload of metadata) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload))
      continue;
    controller.session.append({
      ts: Date.now(),
      turnId,
      type: "meta",
      payload,
    });
  }
}
