import { spawn } from "node:child_process";
import type { Plugin, ToolArgs } from "@cagent/sdk";

interface RunOptions {
  command: string;
  workdir: string;
  timeout: number;
  emit: (stream: "stdout" | "stderr", chunk: string) => void;
}

function runCommand(opts: RunOptions): Promise<{ code: number; stdout: string; stderr: string; timedOut: boolean; error?: string }> {
  const out: string[] = [];
  const err: string[] = [];
  return new Promise((resolve) => {
    let timedOut = false;
    const child = spawn(opts.command, { shell: true, cwd: opts.workdir, env: process.env });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, opts.timeout);
    child.stdout.on("data", (chunk: Buffer) => {
      out.push(chunk.toString("utf8"));
      opts.emit("stdout", chunk.toString("utf8"));
    });
    child.stderr.on("data", (chunk: Buffer) => {
      err.push(chunk.toString("utf8"));
      opts.emit("stderr", chunk.toString("utf8"));
    });
    child.on("error", (e: Error) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout: out.join(""), stderr: err.join(""), timedOut, error: e.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout: out.join(""), stderr: err.join(""), timedOut });
    });
  });
}

const register: Plugin = (ctx) => {
  const defaultTimeout = (ctx.config.timeout_ms as number) ?? 30_000;
  ctx.registerTool({
    name: "bash",
    description: "Executa um comando shell e streama stdout/stderr",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "Comando a executar" },
        workdir: { type: "string", description: "Diretório de execução (default: cwd)" },
        timeout_ms: { type: "number", description: `Timeout em ms (default: ${defaultTimeout})` },
      },
      required: ["command"],
    },
    execute: async (args: ToolArgs) => {
      const result = await runCommand({
        command: String(args.command),
        workdir: args.workdir ? String(args.workdir) : process.cwd(),
        timeout: typeof args.timeout_ms === "number" ? (args.timeout_ms as number) : defaultTimeout,
        emit: (stream, chunk) => ctx.emit(`tools/${stream}`, { tool: "bash", chunk }),
      });
      const isError = result.code !== 0 || result.timedOut || result.error !== undefined;
      const output = result.stderr ? `${result.stdout}\n[stderr] ${result.stderr}` : result.stdout;
      return { output, isError, timedOut: result.timedOut };
    },
  });
};

export default register;
