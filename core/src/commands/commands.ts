import type { Controller } from "../controller/controller";

type SlashHandler = (c: Controller, arg: string) => void | Promise<void>;

// ponytail: the dispatch map replaces the if chain in submit; a new command is a new entry, without touching the controller.
const commands: Record<string, SlashHandler> = {
  "/compact": (c) => c.compact(),
  "/sessions": (c) => c.openSessions(),
  "/session": (c) => c.openSessions(),
  "/new": (c) => c.newSession(),
  "/rename": (c, arg) => c.renameSession(arg.trim()),
  "/tasks": (c, arg) => {
    const parts = arg.trim().split(/\s+/);
    if (!arg.trim() || parts[0] === "list") {
      c.state.notice = c.updateTasks("list", {});
    } else if (parts[0] === "add") {
      c.state.notice = c.updateTasks("create", { titles: [parts.slice(1).join(" ")] });
    } else if (parts[0] === "complete" || parts[0] === "reopen") {
      c.state.notice = c.updateTasks("update", { id: parts[1], status: parts[0] === "complete" ? "completed" : "pending", details: parts.slice(2).join(" ") });
    } else if (parts[0] === "remove") {
      c.state.notice = c.updateTasks("remove", { id: parts[1] });
    } else if (parts[0] === "clear" && parts[1] === "--confirm") {
      c.state.notice = c.updateTasks("clear", {});
    } else {
      c.state.notice = "usage: /tasks [list|add <title>|complete <id> <evidence>|reopen <id>|remove <id>|clear --confirm]";
    }
    c.bump();
  },
  "/model": (c) => c.openModelPicker(),
  "/help": (c) => {
    c.state.helpOpen = true;
    c.bump();
  },
  "/reload-skills": (c) => {
    if (!c.reloadSkills()) return;
    c.state.notice = "skills reloaded";
    c.bump();
  },
  "/skill": async (c, arg) => {
    const match = arg.trim().match(/^([a-z0-9]+(?:-[a-z0-9]+)*)(?:\s+([\s\S]*))?$/);
    const name = match?.[1] ?? "";
    const prompt = match?.[2]?.trim() ?? "";
    if (!name || !(await c.invokeSkill(name, prompt))) {
      c.state.notice = `skill not found or unavailable: ${name || "(missing name)"}`;
      c.bump();
      return;
    }
    await c.submit(prompt || `Apply the ${name} skill now.`);
  },
};

export const commandNames = Object.keys(commands);

export function runSlash(c: Controller, text: string): void | Promise<void> {
  const space = text.indexOf(" ");
  const name = space === -1 ? text : text.slice(0, space);
  const arg = space === -1 ? "" : text.slice(space + 1);
  const handler = commands[name];
  if (!handler) {
    c.state.notice = `unknown command: ${text}`;
    c.bump();
    return;
  }
  return handler(c, arg);
}
