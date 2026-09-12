import type { Controller } from "../controller/controller";

type SlashHandler = (c: Controller, arg: string) => void | Promise<void>;

// ponytail: the dispatch map replaces the if chain in submit; a new command is a new entry, without touching the controller.
const commands: Record<string, SlashHandler> = {
  "/compact": (c) => c.compact(),
  "/sessions": (c) => c.openSessions(),
  "/session": (c) => c.openSessions(),
  "/new": (c) => c.newSession(),
  "/rename": (c, arg) => c.renameSession(arg.trim()),
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
