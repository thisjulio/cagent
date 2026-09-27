import type { Message } from "@cagent/sdk";

const CHARS_PER_TOKEN = 4;

export function recentContext(
  messages: Message[],
  budgetTokens: number,
  toolLimitTokens: number,
  forceReduction = false,
): Message[] {
  const budget = Math.max(1, budgetTokens);
  const blocks = messageBlocks(messages);
  const selected: Message[][] = [];
  let used = 0;

  for (let index = blocks.length - 1; index >= 0; index--) {
    const block = pruneToolOutputs(blocks[index]!, toolLimitTokens);
    const cost = estimateMessages(block);
    if (cost > budget) {
      const bounded = boundedBlock(block, budget - used);
      if (bounded.length) {
        selected.unshift(bounded);
        used += estimateMessages(bounded);
      }
      break;
    }
    if (used + cost > budget) break;
    selected.unshift(block);
    used += cost;
  }
  if (
    forceReduction &&
    selected.length === blocks.length &&
    selected.length > 1
  )
    selected.shift();
  return selected.flat();
}

function boundedBlock(messages: Message[], budget: number): Message[] {
  if (budget < 1) return [];
  const first = messages[0];
  const prompt = first?.role === "user" ? [first] : [];
  const promptCost = estimateMessages(prompt);
  const keepPrompt = promptCost <= budget;
  const selected: Message[][] = [];
  let used = keepPrompt ? promptCost : 0;
  const groups = messageGroups(messages.slice(prompt.length));

  for (let index = groups.length - 1; index >= 0; index--) {
    const group = groups[index]!;
    const cost = estimateMessages(group);
    if (used + cost <= budget) {
      selected.unshift(group);
      used += cost;
      continue;
    }
    if (!selected.length) {
      const partial = fitToolGroup(group, budget - used);
      if (partial.length) selected.unshift(partial);
    }
    break;
  }
  return [...(keepPrompt ? prompt : []), ...selected.flat()];
}

function messageGroups(messages: Message[]): Message[][] {
  const groups: Message[][] = [];
  for (let index = 0; index < messages.length; ) {
    const message = messages[index]!;
    if (message.role === "tool") {
      index++;
      continue;
    }
    const calls =
      message.role === "assistant" ? (message.tool_calls ?? []) : [];
    if (!calls.length) {
      groups.push([message]);
      index++;
      continue;
    }
    let end = index + 1;
    while (end < messages.length && messages[end]?.role === "tool") end++;
    const outputs = messages
      .slice(index + 1, end)
      .filter(
        (output) =>
          output.role === "tool" &&
          calls.some((call) => call.id === output.tool_call_id),
      );
    const completedCalls = calls.filter((call) =>
      outputs.some((output) => output.tool_call_id === call.id),
    );
    if (completedCalls.length) {
      const ids = new Set(completedCalls.map((call) => call.id));
      groups.push([
        { ...message, tool_calls: completedCalls },
        ...outputs.filter((output) => ids.has(output.tool_call_id ?? "")),
      ]);
    }
    index = end;
  }
  return groups;
}

function fitToolGroup(group: Message[], budget: number): Message[] {
  const assistant = group[0];
  if (assistant?.role !== "assistant" || !assistant.tool_calls?.length)
    return [];
  const outputs = group.slice(1).filter((message) => message.role === "tool");
  let selected: Message[] = [];
  let calls: typeof assistant.tool_calls = [];
  for (const call of [...assistant.tool_calls].reverse()) {
    const output = outputs.find((message) => message.tool_call_id === call.id);
    if (!output) continue;
    calls = [call, ...calls];
    const candidate: Message[] = [
      { ...assistant, tool_calls: calls },
      ...outputs.filter((message) =>
        calls.some((item) => item.id === message.tool_call_id),
      ),
    ];
    if (estimateMessages(candidate) > budget) break;
    selected = candidate;
  }
  return selected;
}

function messageBlocks(messages: Message[]): Message[][] {
  const blocks: Message[][] = [];
  let current: Message[] = [];
  for (const message of messages) {
    if (message.role === "user" && current.length) {
      blocks.push(current);
      current = [];
    }
    current.push(message);
  }
  if (current.length) blocks.push(current);
  return blocks;
}

function pruneToolOutputs(
  messages: Message[],
  toolLimitTokens: number,
): Message[] {
  const limit = Math.max(1, toolLimitTokens) * CHARS_PER_TOKEN;
  return messages.map((message) => {
    if (
      message.role !== "tool" ||
      typeof message.content !== "string" ||
      message.content.length <= limit
    )
      return message;
    return {
      ...message,
      content: `${message.content.slice(0, limit)}\n[older tool output pruned]`,
    };
  });
}

function estimateMessages(messages: Message[]): number {
  return Math.ceil(
    messages.reduce((total, message) => {
      const content =
        typeof message.content === "string"
          ? message.content.length
          : message.content.reduce(
              (sum, part) =>
                sum + (part.type === "text" ? part.text.length : 4000),
              0,
            );
      const calls = message.tool_calls
        ? JSON.stringify(message.tool_calls).length
        : 0;
      return total + content + calls;
    }, 0) / CHARS_PER_TOKEN,
  );
}
