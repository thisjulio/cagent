import type { Message } from "@cagent/sdk";

const TURN_REMINDER = [
  "[reminder]",
  "Call one tool in this message, or give the final answer. Never both.",
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
  "`edit_file` takes only `patch` and uses the Codex apply_patch format.",
  "Use `*** Begin Patch` and `*** End Patch`, with one file header per file.",
  "For updates use `*** Update File: path`, an optional `@@` line, then context lines starting with a space, removals with -, and additions with +.",
  "Use `*** Add File: path` for new files, `*** Delete File: path` for deletion, and optional `*** Move to: path` after an update header.",
  "If an edit fails because the target is ambiguous (found multiple times), add more surrounding context lines to make it unique. If it fails because the target was not found, call read_file again and copy the exact current lines.",
  "Read the file first. Do not use markdown fences, SEARCH/REPLACE blocks, shell commands, or conversational text.",
  "`write_file` takes `path` and `content`.",
  "Content is normal text with real line breaks. Use it for new files.",
  "",
  "# Edit order",
  "read_file -> edit_file with patch -> read_file -> run the smallest relevant check",
].join("\n");

export function addAgentPrompt(
  messages: Message[],
  prompt = LLAMA_AGENT_PROMPT,
): Message[] {
  const system = messages.filter((message) => message.role === "system");
  const content = system
    .map((message) =>
      typeof message.content === "string"
        ? message.content
        : message.content
            .filter((part) => part.type === "text")
            .map((part) => (part.type === "text" ? part.text : ""))
            .join("\n"),
    )
    .filter(Boolean)
    .concat(`${prompt}\n\n${TURN_REMINDER}`)
    .join("\n\n");
  const result = messages.filter((message) => message.role !== "system");
  result.unshift({
    role: "system",
    content,
  });
  return result;
}
