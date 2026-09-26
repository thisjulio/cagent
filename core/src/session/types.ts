import type { Message } from "@cagent/sdk";

export type QueueMessage = {
  id: string;
  content: string;
  submittedAt: number;
  status: "queued" | "processing";
};

export type SessionCheckpoint = {
  version: 1;
  summary: string;
  recentMessages: Message[];
};

export type SessionRecord = {
  ts: number;
  turnId?: string;
  type: "user" | "assistant" | "thinking" | "tool" | "meta";
  payload: Record<string, unknown>;
};

export type SessionSnapshotRecord = Omit<SessionRecord, "type"> & {
  type: "snapshot";
};

export type SessionModelSelection = {
  model: string;
  variant?: string;
};

export type SessionLoad = {
  records: SessionRecord[];
  messages: Message[];
  queuedMessages: QueueMessage[];
  modelSelection?: SessionModelSelection;
};

export type SessionSummary = {
  id: string;
  updated: string;
  title: string;
  cwd?: string;
  branch?: string;
  messageCount: number;
};
