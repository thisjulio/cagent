import fs from "node:fs";
import path from "node:path";
import type { Observability } from "@cagent/sdk";
import type { Controller } from "./controller/controller";
import type { CliOptions } from "./cli-args";

function contextFiles(options: CliOptions): string {
  const paths = [...options.files, ...options.directories];
  if (!paths.length) return "";
  const root = path.resolve(process.cwd());
  return paths
    .map((entry) => {
      const target = path.resolve(root, entry);
      if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
        throw new Error(`context path is outside the workspace: ${entry}`);
      }
      if (!fs.existsSync(target))
        throw new Error(`context path does not exist: ${entry}`);
      const stat = fs.statSync(target);
      if (stat.isDirectory())
        return `[context directory] ${path.relative(root, target)}`;
      const content = fs.readFileSync(target, "utf8");
      return `[context file: ${path.relative(root, target)}]\n${content}`;
    })
    .join("\n\n");
}

export async function runHeadless(
  c: Controller,
  options: CliOptions,
  telemetry: Observability,
): Promise<void> {
  if (!options.prompt)
    throw new Error("a prompt is required in non-interactive mode");
  const context = contextFiles(options);
  const prompt = context ? `${context}\n\n${options.prompt}` : options.prompt;
  const human = options.output === "human";
  let answerStarted = false;
  if (human) {
    process.stdout.write(`You\n└─ ${prompt}\n`);
    c.onReasoning = (text) =>
      process.stdout.write(`\u001b[3;90m${text}\u001b[0m`);
    c.onText = (text) => {
      if (!answerStarted) {
        answerStarted = true;
        process.stdout.write("\ncagent\n└─ ");
      }
      process.stdout.write(text);
    };
  }
  const previousAsk = c.ask;
  c.ask = async (tool, args) => {
    if (options.permissionMode === "read-only") return false;
    if (options.permissionMode === "auto" || options.yes) return true;
    process.stderr.write(
      `permission required for ${tool.name}; use --yes or --permission-mode auto\n`,
    );
    return false;
  };
  const onSignal = (signal: NodeJS.Signals) => {
    c.observability?.recordEvent("process.signal", { signal });
    c.interrupt();
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
  const timeout = setTimeout(() => c.interrupt(), options.timeoutMs);
  try {
    telemetry.recordEvent("headless.submit.start", {
      prompt_length: prompt.length,
    });
    await c.submit(prompt);
    // ponytail: wait for the turn to settle after submit resolves; the stream
    // may still be flushing tool results and final chunks through the bus.
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    telemetry.recordEvent("headless.submit.finished", { busy: c.state.busy });
    if (options.output === "jsonl") {
      for (const item of c.state.chat) {
        const event = {
          type: item.kind,
          content: item.content,
          tool: item.toolName,
          error: item.isError,
        };
        process.stdout.write(`${JSON.stringify(event)}\n`);
      }
    } else {
      if (answerStarted) process.stdout.write("\n");
    }
  } finally {
    c.ask = previousAsk;
    clearTimeout(timeout);
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
