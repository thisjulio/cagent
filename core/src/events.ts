import type {
  WorkflowEventHandler,
  WorkflowEventName,
  WorkflowEventPayload,
} from "@cagent/sdk";

export type Handler = (payload: unknown) => unknown;

export class EventBus {
  private handlers = new Map<string, Handler[]>();

  on(event: string, handler: Handler): void {
    const list = this.handlers.get(event) ?? [];
    list.push(handler);
    this.handlers.set(event, list);
  }

  emit(event: string, payload: unknown): void {
    for (const h of this.handlers.get(event) ?? []) h(payload);
  }

  emitWorkflow(event: WorkflowEventName, payload: WorkflowEventPayload): void {
    this.emit(event, payload);
  }

  onWorkflow(event: WorkflowEventName, handler: WorkflowEventHandler): void {
    this.on(event, handler);
  }

  waterfall(event: string, payload: unknown): unknown {
    let p: unknown = payload;
    for (const h of this.handlers.get(event) ?? []) {
      const next = h(p);
      if (next !== undefined) p = next;
    }
    return p;
  }
}
