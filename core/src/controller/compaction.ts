import { streamOnce } from "../loop";
import { estimateTokens, serializeMessages } from "../session";
import { splitRoute } from "../route";
import type { Controller } from "./controller";
import { appendChat } from "./chat-buffer";

export async function compact(c: Controller, force = false, instructions?: string): Promise<void> {
  const s = c.state;
  const threshold = s.threshold;
  const est = estimateTokens(c.messages);
  if (!force && est < threshold) {
    c.observability?.recordEvent("compaction.skipped", { reason: "below_threshold", tokens: est, threshold });
    s.notice = `no compaction (${est} < ${threshold} tokens)`;
    c.bump();
    return;
  }
  const configuredKeep = c.config.compact_keep_tokens;
  const keepBudget = Math.min(20_000, Math.max(1_000, configuredKeep ?? Math.floor(c.state.contextWindow * 0.2)));
  let keepStart = c.messages.length;
  let keptTokens = 0;
  while (keepStart > 1 && keptTokens < keepBudget) {
    keepStart -= 1;
    keptTokens += estimateTokens([c.messages[keepStart]]);
  }
  if (keepStart <= 1) {
    c.observability?.recordEvent("compaction.skipped", { reason: "too_few_messages", "message.count": c.messages.length });
    s.notice = "(not enough to compact)";
    c.bump();
    return;
  }
  const old = c.messages.slice(1, keepStart);
  c.observability?.recordEvent("compaction.started", { tokens: est, threshold, "message.count": old.length });
  s.compacting = true;
  const progress = { kind: "thinking" as const, content: "preparing history", timestamp: Date.now() };
  appendChat(s, progress);
  c.bump();
  // Let OpenTUI paint the progress state before serializing a large history.
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  if (c.interrupted) {
    c.observability?.recordEvent("compaction.interrupted");
    s.compacting = false;
    progress.content = "compaction interrupted";
    c.bump();
    return;
  }
  progress.content = `preparing history (${est} tokens)\npruning large tool outputs\ngenerating handoff...`;
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
      { role: "user", content: `${instructions ? `User focus for this compaction:\n${instructions}\n\n` : ""}${serializeMessages(boundedCompactionInput(old, c.config.compact_prune_tool_tokens ?? 2000))}` },
    ],
    tools: [],
    onText: (text) => {
      progress.content = `preparing history (${est} tokens)\npruning large tool outputs\ngenerating handoff...\n\n${summaryForDisplay(progress.content, text)}`;
      c.bump();
    },
    interrupted: () => c.interrupted,
    attempts: 3,
  });
  if (c.interrupted) {
    c.observability?.recordEvent("compaction.interrupted");
    s.compacting = false;
    progress.content = "compaction interrupted";
    c.bump();
    return;
  }
  const rest = removeOrphanedToolOutputs(c.messages.slice(keepStart));
  s.compacting = false;
  progress.content = `compaction complete (${est} -> ${estimateTokens(c.messages)} tokens)`;
  c.messages.length = 1;
  c.messages.push({ role: "user", content: `[context checkpoint handoff]\n${summary}` }, ...rest);
  c.session.append({ ts: Date.now(), type: "meta", payload: { kind: "compacted", summary } });
  appendChat(s, { kind: "meta", content: `compacted: ${est} -> ${estimateTokens(c.messages)} tokens` });
  s.tokens = estimateTokens(c.messages);
  c.observability?.recordEvent("compaction.completed", {
    "tokens.before": est,
    "tokens.after": s.tokens,
    "message.count": old.length,
  });
  c.bump();
}
