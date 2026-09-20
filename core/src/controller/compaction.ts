import { streamOnce } from "../loop";
import { serializeMessages } from "../session/index";
import { splitRoute } from "../route";
import type { Controller } from "./controller";
import { appendChat } from "./chat-buffer";
import { recentContext } from "../context/recent-context";

function summaryForDisplay(previous: string, chunk: string): string {
  const marker = "\n\n";
  const current = previous.split(marker)[1] ?? "";
  return `${current}${chunk}`.slice(-6000);
}

function boundedCompactionInput(
  messages: Controller["messages"],
  toolLimit: number,
): Controller["messages"] {
  return messages.map((message) => {
    if (
      message.role !== "tool" ||
      typeof message.content !== "string" ||
      message.content.length <= toolLimit * 4
    )
      return message;
    return {
      ...message,
      content: `${message.content.slice(0, toolLimit * 4)}\n[older tool output pruned]`,
    };
  });
}

function removeOrphanedToolOutputs(
  messages: Controller["messages"],
): Controller["messages"] {
  const firstMessage = messages.findIndex((message) => message.role !== "tool");
  return firstMessage === -1 ? [] : messages.slice(firstMessage);
}

export async function compact(
  c: Controller,
  force = false,
  instructions?: string,
): Promise<void> {
  const s = c.state;
  const reason = force
    ? instructions
      ? "manual_with_instructions"
      : "manual"
    : "threshold";
  const old = c.messages.slice(1);
  const recent = recentContext(
    old,
    c.config.compact_keep_tokens ?? 32000,
    c.config.compact_prune_tool_tokens ?? 2000,
    force,
  );
  if (!recent.length || recent.length === old.length) {
    c.observability?.recordEvent("compaction.skipped", {
      reason: "too_few_messages",
      "message.count": c.messages.length,
    });
    s.notice = "(not enough to compact)";
    c.bump();
    return;
  }
  const recentStart = old.length - recent.length;
  const compacted = old.slice(0, recentStart);
  c.observability?.recordEvent("compaction.started", {
    force,
    reason,
    "state.tokens": s.tokens ?? 0,
    "context.window": s.contextWindow,
    model: s.model,
    "message.count": compacted.length,
  });
  s.compacting = true;
  const progress = {
    kind: "thinking" as const,
    content: "preparing history",
    timestamp: Date.now(),
  };
  appendChat(s, progress);
  c.bump();
  // Let OpenTUI paint the progress state before serializing a large history.
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  if (c.isInterrupted()) {
    c.observability?.recordEvent("compaction.interrupted");
    s.compacting = false;
    progress.content = "compaction interrupted";
    c.bump();
    return;
  }
  progress.content =
    "preparing history\npruning large tool outputs\ngenerating handoff...";
  c.bump();
  const { text: summary } = await streamOnce({
    adapter: c.adapter,
    model: splitRoute(s.model)[1],
    messages: [
      {
        role: "system",
        content:
          "Create a structured handoff for another model. Preserve completed work, current work, files and symbols involved, decisions and why, executed commands and results, constraints, risks, and explicit next steps. Be concise but detailed enough to continue without repeating work. Do not invent facts.",
      },
      {
        role: "user",
        content: `${instructions ? `User focus for this compaction:\n${instructions}\n\n` : ""}${serializeMessages(boundedCompactionInput(old, c.config.compact_prune_tool_tokens ?? 2000))}`,
      },
    ],
    tools: [],
    onText: (text) => {
      progress.content = `preparing history\npruning large tool outputs\ngenerating handoff...\n\n${summaryForDisplay(progress.content, text)}`;
      c.bump();
    },
    interrupted: () => c.isInterrupted(),
    attempts: 3,
  });
  if (c.isInterrupted()) {
    c.observability?.recordEvent("compaction.interrupted");
    s.compacting = false;
    progress.content = "compaction interrupted";
    c.bump();
    return;
  }
  const rest = removeOrphanedToolOutputs(recent);
  s.compacting = false;
  progress.content = "compaction complete";
  c.messages.length = 1;
  c.messages.push(
    { role: "user", content: `[context checkpoint handoff]\n${summary}` },
    ...rest,
  );
  c.session.append({
    ts: Date.now(),
    type: "meta",
    payload: { kind: "compacted", summary },
  });
  appendChat(s, {
    kind: "meta",
    content: "compacted: history checkpoint created",
  });
  c.observability?.recordEvent("compaction.completed", {
    "message.count": compacted.length,
  });
  c.bump();
}
