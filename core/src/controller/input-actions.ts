import { inputSuggestions } from "../commands/suggest";
import { fuzzyProjectFiles } from "../context/file-mentions";
import { loadHistory, searchHistory } from "../session/history";
import type { Controller } from "./controller";

export function latestUserMessage(controller: Controller): string | null {
  const latest = loadHistory(process.cwd()).at(-1)?.text;
  if (latest) return latest;
  const message = [...controller.messages]
    .reverse()
    .find((entry) => entry.role === "user");
  return typeof message?.content === "string" ? message.content : null;
}

export function historyEntries(query = ""): string[] {
  return searchHistory(process.cwd(), query).map((entry) => entry.text);
}

export function setInput(controller: Controller, value: string): void {
  controller.state.input = value;
  controller.state.suggest = suggestions(controller, value);
  controller.state.suggestIdx = -1;
  controller.bump();
}

export function reloadSkills(controller: Controller): boolean {
  if (!controller.reloadSkillsAction()) return false;
  controller.state.suggest = suggestions(controller, controller.state.input);
  controller.state.suggestIdx = -1;
  return true;
}

function suggestions(controller: Controller, input: string) {
  const mention = input.match(/(?:^|\s)@([^\s]*)$/);
  return inputSuggestions(
    input,
    controller.skillNames(),
    [...controller.commandNames(), ...(controller.pluginCommands ?? [])],
    controller.subagentNames(),
    controller.pluginCommandSubcommands,
    mention ? fuzzyProjectFiles(mention[1]) : [],
  );
}
