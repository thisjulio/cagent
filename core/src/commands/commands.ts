import type { Controller } from "../controller/controller";
import { expandCommand } from "./discovery";
import { appendChat, notify } from "../controller/chat-buffer";
import type { Task } from "../tasks";
import { MAX_PREFERENCE_LENGTH, type UserPreference } from "../preferences";
import { runInit } from "./init";

type SlashHandler = (c: Controller, arg: string) => void | Promise<void>;

// ponytail: the dispatch map replaces the if chain in submit; a new command is a new entry, without touching the controller.
const commands: Record<string, SlashHandler> = {
  "/init": runInit,
  "/preference": (c, arg) => {
    const [operation = "list", ...rest] = arg.trim().split(/\s+/);
    const text = rest.join(" ").trim();
    const result = c.updatePreferences((preferences) =>
      preferenceOperation(operation, rest, text, preferences),
    );
    appendChat(c.state, {
      kind: "assistant",
      content: result,
      command: `/preference${arg ? ` ${arg}` : ""}`,
    });
    c.bump();
  },
  "/lsp": (c) => c.openLspDoctor(),
  "/diff": (c) => {
    if (!c.state.currentTurnId) {
      notify(c.state, "no file changes in the current turn");
      return;
    }
    c.openToolViewer("forward", c.state.currentTurnId);
  },
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
    const operation = parts[0] || "list";
    let result: string;
    if (operation === "create") {
      result = c.updateTasks(operation, { titles: [parts.slice(1).join(" ")] });
    } else if (operation === "add") {
      result = c.updateTasks(operation, { title: parts.slice(1).join(" ") });
    } else if (["next", "skip", "block"].includes(operation)) {
      result = c.updateTasks(operation, { details: parts.slice(1).join(" ") });
    } else if (["list", "clear", "resume"].includes(operation)) {
      result = c.updateTasks(operation, {});
    } else {
      result =
        "usage: /tasks [create <title>|add <title>|list|next|skip|block <request>|resume|clear]";
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
  "/models": (c) => c.openModelPicker(),
  "/mode": (c, arg) => {
    const mode = arg.trim();
    if (!["ask", "auto", "read-only"].includes(mode)) {
      notify(c.state, "usage: /mode ask|auto|read-only");
      return;
    }
    c.state.permissionMode = mode as "ask" | "auto" | "read-only";
    c.bump();
    notify(c.state, `permission mode: ${mode}`);
  },
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
      c.session.appendModelSelection({ model: c.state.model, variant: val });
    }
    c.bump();
  },
  "/help": (c, arg) => {
    c.state.helpOpen = true;
    c.state.helpTopic = arg.trim() || undefined;
    c.observability?.recordEvent("command.executed", {
      "command.name": "/help",
      "command.known": true,
      "argument.length": arg.trim().length,
      session_id: c.state.sessionId,
    });
    c.bump();
  },
  "/usage": (c) => {
    c.state.infoPanel = "usage";
    c.observability?.recordEvent("command.executed", {
      "command.name": "/usage",
      "command.known": true,
      session_id: c.state.sessionId,
    });
    c.bump();
  },
  "/telemetry": (c) => {
    c.state.infoPanel = "telemetry";
    c.state.telemetrySummary = c.getTelemetrySummary();
    c.observability?.recordEvent("command.executed", {
      "command.name": "/telemetry",
      "command.known": true,
      session_id: c.state.sessionId,
    });
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

function preferenceOperation(
  operation: string,
  args: string[],
  text: string,
  preferences: UserPreference[],
): string {
  if (operation === "list") {
    return preferences.length === 0
      ? "Preferences\n└─ no preferences"
      : [
          "Preferences",
          ...preferences.map(
            (item) =>
              `├─ [${item.id}] ${item.enabled ? "active" : "disabled"} ${item.text}`,
          ),
        ].join("\n");
  }
  if (operation === "add") {
    if (!text) return "error: usage: /preference add <text>";
    if (text.length > MAX_PREFERENCE_LENGTH)
      return `error: preference must be at most ${MAX_PREFERENCE_LENGTH} characters`;
    const id = Math.max(0, ...preferences.map((item) => item.id)) + 1;
    preferences.push({ id, text, enabled: true });
    return `Preference added [${id}]`;
  }
  const id = Number(args[0]);
  const item = preferences.find((candidate) => candidate.id === id);
  if (!item) return "error: preference ID not found";
  if (operation === "toggle") {
    item.enabled = !item.enabled;
    return `Preference [${id}] ${item.enabled ? "enabled" : "disabled"}`;
  }
  if (operation === "remove") {
    preferences.splice(preferences.indexOf(item), 1);
    return `Preference removed [${id}]`;
  }
  if (operation === "edit") {
    if (!text) return "error: usage: /preference edit <id> <text>";
    if (text.length > MAX_PREFERENCE_LENGTH)
      return `error: preference must be at most ${MAX_PREFERENCE_LENGTH} characters`;
    item.text = text;
    return `Preference edited [${id}]`;
  }
  return "error: usage: /preference [add <text>|list|edit <id> <text>|toggle <id>|remove <id>]";
}

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
    session_id: c.state.sessionId,
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
