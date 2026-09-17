import type { Message } from "@cagent/sdk";

const TURN_REMINDER = [
  "[reminder]",
  "Call one tool in this message, or give the final answer. Never both.",
  "Keep exactly one task `in_progress`.",
  "Do not complete a task without output from a tool you ran.",
  "Before the final answer, call `tasks` and read the list.",
].join("\n");

export const LLAMA_AGENT_PROMPT = [
  "# Small model rules",
  "Call one tool per message, or give the final answer. Never both.",
  "Read a file before editing it.",
  "Use exact tool and argument names from the schema.",
  "If a tool errors, change the arguments before retrying.",
  "After two failures, use another tool or ask the user.",
  "",
  "# Editing files",
  "`edit_file` takes `path` and `blocks`. Nothing else.",
  "Use this exact shape:",
  "<<< SEARCH",
  "old text copied from read_file",
  ">>>",
  "<<< REPLACE",
  "new text",
  ">>>",
  "Copy SEARCH text character for character, including indentation.",
  "Read the file first. Do not use markdown fences, `sed`, or patch syntax.",
  "`write_file` takes `path` and `content`.",
  "Content is normal text with real line breaks. Use it for new files.",
  "",
  "# Edit order",
  "read_file -> edit_file -> read_file -> run the smallest relevant check",
].join("\n");

export function addAgentPrompt(messages: Message[], prompt = LLAMA_AGENT_PROMPT): Message[] {
  const index = messages.findIndex((message) => message.role === "system");
  if (index === -1) return [{ role: "system", content: `${prompt}\n\n${TURN_REMINDER}` }, ...messages];
  const result = messages.map((message) => ({ ...message }));
  result[index] = { ...result[index], content: `${result[index].content}\n\n${prompt}\n\n${TURN_REMINDER}` };
  return result;
}