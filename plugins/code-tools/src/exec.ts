import { spawn } from "node:child_process";

export interface CmdResult {
  code: number;
  stdout: string;
  stderr: string;
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
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
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
