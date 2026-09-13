import type { Message } from "@cagent/sdk";

export const LLAMA_AGENT_PROMPT = [
  "You are operating as a careful coding agent.",
  "Follow the available tool schemas exactly. Never invent tool names or argument fields.",
  "Before changing files, inspect the relevant file and make a short plan.",
  "Use one tool call at a time unless calls are independent and the tool explicitly supports batching.",
  "When a tool reports an error, read it, correct the arguments, and do not repeat the same failed call.",
  "For edits, use the exact edit format described by the tool. Do not substitute another format.",
  "For edit_file, use only its JSON path and blocks arguments. The blocks value must use literal delimiters <<< SEARCH, >>>, <<< REPLACE, >>>. Copy the exact current text from read_file; never use sed, shell editing, markdown fences, or *** patch syntax.",
  "For write_file, send valid JSON arguments with both path and content. Escape newlines in content as \\n and never wrap arguments in markdown fences.",
  "After each change, inspect the result and run the smallest relevant verification.",
  "Do not claim a task is complete while any planned step remains pending.",
  "Keep investigation focused: stop searching when the implementation and its risks are understood.",
  "Answer the user briefly after completing the work.",
].join("\n");

export function addAgentPrompt(messages: Message[], prompt = LLAMA_AGENT_PROMPT): Message[] {
  const index = messages.findIndex((message) => message.role === "system");
  if (index === -1) return [{ role: "system", content: prompt }, ...messages];
  const result = messages.map((message) => ({ ...message }));
  result[index] = { ...result[index], content: `${result[index].content}\n\n${prompt}` };
  return result;
}