import type { Controller } from "./controller";
import { compact } from "./compaction";
import {
  openSessions,
  renameSession,
  restoreSession,
  startNewSession,
} from "./sessions";

export function newSession(c: Controller): void {
  startNewSession(c);
}
export function resumeSession(c: Controller, id: string): Promise<void> {
  return restoreSession(c, id);
}
export function rename(c: Controller, name: string): void {
  renameSession(c, name);
}
export function open(c: Controller): void {
  openSessions(c);
}
export function compactSession(
  c: Controller,
  instructions?: string,
): Promise<void> {
  if (c.state.busy) return Promise.resolve();
  c.state.busy = true;
  c.state.turnStartedAt = Date.now();
  c.state.elapsedMs = 0;
  c.bump();
  const timer = setInterval(() => {
    if (c.state.turnStartedAt) {
      c.state.elapsedMs = Date.now() - c.state.turnStartedAt;
      c.bump();
    }
  }, 500);
  return compact(c, true, instructions).finally(() => {
    clearInterval(timer);
    c.state.busy = false;
    c.state.elapsedMs = c.state.turnStartedAt
      ? Date.now() - c.state.turnStartedAt
      : 0;
    c.state.turnStartedAt = null;
    c.bump();
  });
}
