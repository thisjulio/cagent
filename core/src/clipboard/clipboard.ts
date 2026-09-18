import { spawn } from "node:child_process";

type Command = { command: string; args: string[] };
const readers: Command[] = [
  { command: "wl-paste", args: ["--no-newline"] },
  { command: "xclip", args: ["-selection", "clipboard", "-o"] },
  { command: "xsel", args: ["--clipboard", "--output"] },
  { command: "pbpaste", args: [] },
  {
    command: "powershell.exe",
    args: ["-NoProfile", "-Command", "Get-Clipboard"],
  },
];
const writers: Command[] = [
  { command: "wl-copy", args: [] },
  { command: "xclip", args: ["-selection", "clipboard"] },
  { command: "xsel", args: ["--clipboard", "--input"] },
  { command: "pbcopy", args: [] },
  { command: "clip.exe", args: [] },
];

export async function readClipboard(): Promise<string | undefined> {
  for (const command of readers) {
    const value = await run(command);
    if (value !== undefined) return value;
  }
  return undefined;
}

export async function writeClipboard(text: string): Promise<boolean> {
  for (const command of writers)
    if ((await run(command, text)) !== undefined) return true;
  return false;
}

function run(command: Command, input?: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    const child = spawn(command.command, command.args, {
      stdio: ["pipe", "pipe", "ignore"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.on("error", () => resolve(undefined));
    child.on("close", (code) => resolve(code === 0 ? output : undefined));
    child.stdin.end(input);
  });
}
