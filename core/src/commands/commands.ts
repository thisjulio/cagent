import type { Controller } from "../controller/controller";

type SlashHandler = (c: Controller, arg: string) => void | Promise<void>;

// ponytail: mapa de despacho substitui a cadeia de if no submit; comando novo = nova entrada, sem tocar no controller
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
};

export function runSlash(c: Controller, text: string): void | Promise<void> {
  const space = text.indexOf(" ");
  const name = space === -1 ? text : text.slice(0, space);
  const arg = space === -1 ? "" : text.slice(space + 1);
  const handler = commands[name];
  if (!handler) {
    c.state.notice = `comando desconhecido: ${text}`;
    c.bump();
    return;
  }
  return handler(c, arg);
}
