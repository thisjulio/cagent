import { spawn } from "node:child_process";
import type { Plugin, ToolArgs } from "@cagent/sdk";

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
      const command = String(args.command);
      const workdir = args.workdir ? String(args.workdir) : process.cwd();
      const timeout = typeof args.timeout_ms === "number" ? (args.timeout_ms as number) : defaultTimeout;
      const out: string[] = [];
      const err: string[] = [];

      const result = await new Promise<unknown>((resolve) => {
        let timedOut = false;
        const child = spawn(command, { shell: true, cwd: workdir, env: process.env });
        const timer = setTimeout(() => {
          timedOut = true;
          child.kill("SIGTERM");
        }, timeout);

        child.stdout.on("data", (chunk: Buffer) => {
          out.push(chunk.toString("utf8"));
          ctx.emit("tools/stdout", { tool: "bash", chunk: chunk.toString("utf8") });
        });
        child.stderr.on("data", (chunk: Buffer) => {
          err.push(chunk.toString("utf8"));
          ctx.emit("tools/stderr", { tool: "bash", chunk: chunk.toString("utf8") });
        });
        child.on("error", (e: Error) => {
          clearTimeout(timer);
          resolve({ code: -1, stdout: out.join(""), stderr: err.join(""), timedOut, error: e.message });
        });
        child.on("close", (code) => {
          clearTimeout(timer);
          resolve({ code, stdout: out.join(""), stderr: err.join(), timedOut });
        });
      });

      const r = result as { code: number; stdout: string; stderr: string; timedOut: boolean; error?: string };
      const isError = r.code !== 0 || r.timedOut || r.error !== undefined;
      const output = r.stderr ? `${r.stdout}\n[stderr] ${r.stderr}` : r.stdout;
      return { output, isError, timedOut: r.timedOut };
    },
  });
};

export default register;
