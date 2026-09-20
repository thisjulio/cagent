import type { Message } from "@cagent/sdk";

export type QueueMessage = {
  id: string;
  content: string;
  submittedAt: number;
  status: "queued" | "processing";
};

export type SessionRecord = {
  ts: number;
  turnId?: string;
  type: "user" | "assistant" | "thinking" | "tool" | "meta";
  payload: Record<string, unknown>;
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
};
