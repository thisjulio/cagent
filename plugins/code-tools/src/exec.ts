import { spawn } from "node:child_process";

export interface CmdResult {
  code: number;
  stdout: string;
  stderr: string;
}

const MAX_OUTPUT_CHARS = 128 * 1024;

function appendOutput(current: string, chunk: Buffer): string {
  const next = current + chunk.toString();
  return next.length <= MAX_OUTPUT_CHARS
    ? next
    : next.slice(0, MAX_OUTPUT_CHARS);
}

export function runCmd(
  cmd: string,
  argv: string[],
  opts?: { cwd?: string; timeoutMs?: number },
): Promise<CmdResult> {
  return new Promise((resolve) => {
    const child = spawn(cmd, argv, { cwd: opts?.cwd });
    let stdout = "";
    let stderr = "";
    const timer = opts?.timeoutMs
      ? setTimeout(() => child.kill("SIGKILL"), opts.timeoutMs)
      : undefined;
    child.stdout.on("data", (d: Buffer) => (stdout = appendOutput(stdout, d)));
    child.stderr.on("data", (d: Buffer) => (stderr = appendOutput(stderr, d)));
    child.on("error", (e: Error) => {
      if (timer) clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: e.message });
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({ code: code ?? 0, stdout, stderr });
    });
  });
}
