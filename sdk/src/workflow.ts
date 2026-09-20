import type { ToolArgs, ToolResult } from "./tools";

export const WORKFLOW_EVENTS = [
  "session.started",
  "message.submitted",
  "prompt.assembling",
  "prompt.assembled",
  "tool.completed",
  "turn.completed",
  "session.compacted",
  "session.completed",
] as const;

export type WorkflowEventName = (typeof WORKFLOW_EVENTS)[number];
export type WorkflowEventPayload = {
  version: 1;
  sessionId?: string;
  projectId?: string;
  data: Readonly<Record<string, unknown>>;
};
export type WorkflowEventHandler = (
  payload: WorkflowEventPayload,
) => unknown | Promise<unknown>;

export function workflowEvent(
  data: Record<string, unknown>,
  identifiers: Pick<WorkflowEventPayload, "sessionId" | "projectId"> = {},
): WorkflowEventPayload {
  return { version: 1, ...identifiers, data };
}

export type HookPhase =
  | "before_tool"
  | "after_tool"
  | "session_start"
  | "user_prompt_submit"
  | "subagent_start";
export type HookAction = "allow" | "ask" | "deny" | "continue";

export type HookEvent = {
  phase: HookPhase;
  tool?: string;
  args?: ToolArgs;
  result?: ToolResult;
  error?: string;
  prompt?: string;
  subagent?: string;
  task?: string;
};

export type HookResponse = {
  action: HookAction;
  reason?: string;
  message?: string;
};

export type HookHandler = (
  event: HookEvent,
) => HookResponse | void | Promise<HookResponse | void>;

export type HookDefinition = {
  name: string;
  phase: HookPhase;
  handle: HookHandler;
};

export type SubagentDefinition = {
  name: string;
  description: string;
  instructions: string;
  model?: string;
  tools?: string[];
};
