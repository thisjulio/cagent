import type { Controller } from "../controller/controller";
import { expandCommand } from "./discovery";
import { appendChat, notify } from "../controller/chat-buffer";
import { saveLastChoice } from "../controller/model-persistence";
import type { Task } from "../tasks";

type SlashHandler = (c: Controller, arg: string) => void | Promise<void>;

// ponytail: the dispatch map replaces the if chain in submit; a new command is a new entry, without touching the controller.
const commands: Record<string, SlashHandler> = {
  "/compact": (c, arg) => {
    appendChat(c.state, {
      kind: "user",
      content: `/compact${arg.trim() ? ` ${arg.trim()}` : ""}`,
    });
    c.bump();
    return c.compact(arg.trim() || undefined);
  },
  "/sessions": (c) => c.openSessions(),
  "/session": (c) => c.openSessions(),
  "/new": (c) => c.newSession(),
  "/rename": (c, arg) => c.renameSession(arg.trim()),
  "/tasks": (c, arg) => {
    appendChat(c.state, {
      kind: "user",
      content: `/tasks${arg ? ` ${arg}` : ""}`,
    });
    const parts = arg.trim().split(/\s+/);
    let result: string;
    if (!arg.trim() || parts[0] === "list") {
      result = JSON.stringify(c.state.tasks);
    } else if (parts[0] === "create") {
      result = c.updateTasks("batch", {
        operations: [{ op: "create", titles: [parts.slice(1).join(" ")] }],
      });
    } else if (parts[0] === "add") {
      result = c.updateTasks("batch", {
        operations: [
          {
            op: "add",
            title: parts.slice(1).join(" "),
          },
        ],
      });
    } else if (["next", "cancel", "block"].includes(parts[0])) {
      result = c.updateTasks("batch", {
        operations: [{ op: parts[0], details: parts.slice(1).join(" ") }],
      });
    } else if (parts[0] === "clear") {
      result = c.updateTasks("batch", { operations: [{ op: "clear" }] });
    } else {
      result =
        "usage: /tasks [create <title>|add <title>|list|next|cancel|block <request>|clear]";
    }
    appendChat(c.state, {
      kind: "assistant",
      content: formatTaskResult(result),
      command: `/tasks${arg ? ` ${arg}` : ""}`,
    });
    c.state.notice = "";
    c.bump();
  },
  "/model": (c) => c.openModelPicker(),
  "/variant": (c, arg) => {
    const val = arg.trim();
    if (!val) {
      notify(
        c.state,
        c.state.variant ? `variant: ${c.state.variant}` : "no variant set",
      );
      return;
    }
    c.state.variant = val;
    notify(c.state, `variant set to: ${val}`);
    if (c.state.model) {
      saveLastChoice(c.state.model, val, c.modelChoiceFile);
      c.session.appendModelSelection({ model: c.state.model, variant: val });
    }
    c.bump();
  },
  "/help": (c) => {
    c.observability?.recordEvent("help.opened");
    c.state.helpOpen = true;
    c.bump();
  },
  "/reload-skills": (c) => {
    if (!c.reloadSkills()) return;
    notify(c.state, "skills reloaded");
  },
  "/skill": async (c, arg) => {
    const match = arg
      .trim()
      .match(/^([a-z0-9]+(?:-[a-z0-9]+)*)(?:\s+([\s\S]*))?$/);
    const name = match?.[1] ?? "";
    const prompt = match?.[2]?.trim() ?? "";
    if (!name || !(await c.invokeSkill(name, prompt))) {
      notify(
        c.state,
        `skill not found or unavailable: ${name || "(missing name)"}`,
      );
      return;
    }
    await c.submit(prompt || `Apply the ${name} skill now.`);
  },
};

function formatTaskResult(result: string): string {
  try {
    const tasks = JSON.parse(result) as Task[];
    if (!Array.isArray(tasks)) return result;
    if (tasks.length === 0) return "Tasks\n└─ no tasks";
    return [
      "Tasks",
      ...tasks.map((task, index) => {
        const marker =
          task.status === "completed"
            ? "✓"
            : task.status === "in_progress"
              ? "◌"
              : "·";
        const branch = index === tasks.length - 1 ? "└─" : "├─";
        return `${branch} ${marker} ${task.title} [${task.status}]`;
      }),
    ].join("\n");
  } catch {
    return result;
  }
}

function parseValues(argumentsText: string): Record<string, string | boolean> {
  const values: Record<string, string | boolean> = {};
  for (const token of argumentsText.match(/(?:[^\s"]+|"[^"]*")+/g) ?? []) {
    if (!token.startsWith("--")) continue;
    const [key, value] = token.slice(2).split("=", 2);
    values[key] = value === undefined ? true : value.replace(/^"|"$/g, "");
  }
  return values;
}

export const commandNames = Object.keys(commands);

export function runSlash(c: Controller, text: string): void | Promise<void> {
  const space = text.indexOf(" ");
  const name = space === -1 ? text : text.slice(0, space);
  const arg = space === -1 ? "" : text.slice(space + 1);
  const handler = commands[name];
  const pluginCommand = c.registry.command(name.slice(1));
  const custom = c.customCommand(name);
  c.observability?.recordEvent("command.executed", {
    "command.name": name,
    "command.known": Boolean(handler || custom || pluginCommand),
    "argument.length": arg.length,
  });
  if (!handler && custom) {
    return c.submit(expandCommand(custom, arg));
  }
  if (!handler && pluginCommand) {
    return Promise.resolve(
      pluginCommand.execute({
        name: pluginCommand.name,
        arguments: arg,
        values: parseValues(arg),
      }),
    )
      .then((output: string) => {
        appendChat(c.state, {
          kind: "assistant",
          content: output,
          command: text,
        });
        c.bump();
      })
      .catch((error: unknown) => {
        notify(c.state, error instanceof Error ? error.message : String(error));
      });
  }
  if (!handler) {
    notify(c.state, `unknown command: ${text}`);
    return;
  }
  return handler(c, arg);
}
