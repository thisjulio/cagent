import { spawn } from "node:child_process";
import type { Plugin, ToolArgs } from "@cagent/sdk";

interface RunOptions {
  command: string;
  workdir: string;
  timeout: number;
  emit: (stream: "stdout" | "stderr", chunk: string) => void;
  signal?: AbortSignal;
}

const MAX_OUTPUT_CHARS = 128 * 1024;
type OutputBuffer = { parts: string[]; length: number; truncated: boolean };

function capture(buffer: OutputBuffer, chunk: string): string {
  const remaining = MAX_OUTPUT_CHARS - buffer.length;
  if (remaining <= 0) { buffer.truncated = true; return ""; }
  const kept = chunk.slice(0, remaining);
  buffer.parts.push(kept);
  buffer.length += kept.length;
  if (kept.length < chunk.length) buffer.truncated = true;
  return kept;
}

function output(buffer: OutputBuffer): string {
  return buffer.parts.join("") + (buffer.truncated ? "\n[output truncated to preserve memory]" : "");
}

function runCommand(opts: RunOptions): Promise<{ code: number; stdout: string; stderr: string; timedOut: boolean; cancelled?: boolean; error?: string }> {
  const out: OutputBuffer = { parts: [], length: 0, truncated: false };
  const err: OutputBuffer = { parts: [], length: 0, truncated: false };
  return new Promise((resolve) => {
    let timedOut = false;
    let cancelled = false;
    const child = spawn(opts.command, { shell: true, cwd: opts.workdir, env: process.env, detached: true });

    const killProcess = () => {
      if (child.pid) process.kill(-child.pid, "SIGKILL");
    };

    const timer = setTimeout(() => {
      timedOut = true;
      // Kill the shell's process group so descendants cannot keep stdout open.
      killProcess();
    }, opts.timeout);

    if (opts.signal) {
      opts.signal.addEventListener("abort", () => {
        cancelled = true;
        killProcess();
      });
    }

    child.stdout.on("data", (chunk: Buffer) => {
      const text = capture(out, chunk.toString("utf8"));
      if (text) opts.emit("stdout", text);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      const text = capture(err, chunk.toString("utf8"));
      if (text) opts.emit("stderr", text);
    });
    child.on("error", (e: Error) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout: output(out), stderr: output(err), timedOut, cancelled, error: e.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout: output(out), stderr: output(err), timedOut, cancelled });
    });
  });
}

const register: Plugin = (ctx) => {
  const defaultTimeout = (ctx.config.timeout_ms as number) ?? 30_000;
  ctx.registerTool({
    name: "bash",
    description: "Runs a shell command and streams stdout/stderr",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "Command to run" },
        workdir: { type: "string", description: "Working directory (default: cwd)" },
        timeout_ms: { type: "number", description: `Timeout in ms (default: ${defaultTimeout})` },
      },
      required: ["command"],
    },
    execute: async (args: ToolArgs) => {
      const signal = args.signal as AbortSignal | undefined;
      const result = await runCommand({
        command: String(args.command),
        workdir: args.workdir ? String(args.workdir) : process.cwd(),
        timeout: typeof args.timeout_ms === "number" ? (args.timeout_ms as number) : defaultTimeout,
        emit: (stream, chunk) => ctx.emit(`tools/${stream}`, { tool: "bash", chunk }),
        signal,
      });
      if (result.cancelled) {
        return { output: "cancelled by user", isError: true, cancelled: true };
      }
      const isError = result.code !== 0 || result.timedOut || result.error !== undefined;
      const output = result.stderr ? `${result.stdout}\n[stderr] ${result.stderr}` : result.stdout;
      return { output, isError, timedOut: result.timedOut };
    },
  });
};

export default register;
