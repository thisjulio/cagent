import { inputSuggestions } from "../commands/suggest";
import { hasProjectFiles, loadProjectFiles } from "../context/file-index";
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
  updateSuggestions(controller, value);
  controller.state.suggestIdx = -1;
  controller.bump();
}

export function reloadSkills(controller: Controller): boolean {
  if (!controller.reloadSkillsAction()) return false;
  updateSuggestions(controller, controller.state.input);
  controller.state.suggestIdx = -1;
  return true;
}

function updateSuggestions(controller: Controller, input: string): void {
  controller.state.suggest = suggestions(controller, input);
  const mention = input.match(/(?:^|\s)@([^\s]*)$/);
  if (!mention || hasProjectFiles()) return;
  void loadProjectFiles().then(() => {
    if (controller.state.input !== input) return;
    controller.state.suggest = suggestions(controller, input);
    controller.state.suggestIdx = -1;
    controller.bump();
  });
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
