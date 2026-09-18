import path from "node:path";

const PLUGIN_ROOT = path.resolve(path.join(import.meta.dir, ".."));

export function expandCommand(command: string, cwd: string): string {
  return command
    .replace(/\$\{PLUGIN_ROOT\}/g, PLUGIN_ROOT)
    .replace(/\$\{CWD\}/g, cwd)
    .replace(/\$\{HOME\}/g, process.env.HOME ?? "");
}
