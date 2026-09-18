export type CliOutput = "human" | "jsonl";
export type PermissionMode = "ask" | "auto" | "read-only";

export type CliOptions = {
  prompt: string;
  files: string[];
  directories: string[];
  output: CliOutput;
  permissionMode: PermissionMode;
  yes: boolean;
  interactive: boolean;
  nonInteractive: boolean;
  session?: string;
  newSession: boolean;
  maxTurns: number;
  maxToolCalls: number;
  timeoutMs: number;
  model?: string;
  variant?: string;
  logLevel?: "silent" | "error" | "warn" | "info" | "debug";
  telemetry?: boolean;
  help: boolean;
  version: boolean;
};

const duration = (value: string): number => {
  const match = /^(\d+)(ms|s|m|h)?$/.exec(value);
  if (!match) throw new Error(`invalid duration: ${value}`);
  const n = Number(match[1]);
  return (
    n * ({ ms: 1, s: 1_000, m: 60_000, h: 3_600_000 }[match[2] ?? "ms"] ?? 1)
  );
};

export function parseCliArgs(args: string[], stdin = ""): CliOptions {
  const options: CliOptions = {
    prompt: "",
    files: [],
    directories: [],
    output: "human",
    permissionMode: "ask",
    yes: false,
    interactive: false,
    nonInteractive: false,
    newSession: true,
    maxTurns: 20,
    maxToolCalls: 50,
    timeoutMs: 600_000,
    help: false,
    version: false,
  };
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = () =>
      args[++i] ??
      (() => {
        throw new Error(`missing value for ${arg}`);
      })();
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--version") options.version = true;
    else if (arg === "--interactive") options.interactive = true;
    else if (arg === "--non-interactive") options.nonInteractive = true;
    else if (arg === "--yes") {
      options.yes = true;
      options.permissionMode = "auto";
    } else if (arg === "--new-session") options.newSession = true;
    else if (arg === "--session") {
      options.session = next();
      options.newSession = false;
    } else if (arg === "--prompt" || arg === "-p") positional.push(next());
    else if (arg === "--file" || arg === "-f") options.files.push(next());
    else if (arg === "--directory" || arg === "-d")
      options.directories.push(next());
    else if (arg === "--output") {
      const value = next();
      if (value !== "human" && value !== "jsonl")
        throw new Error("--output must be human or jsonl");
      options.output = value;
    } else if (arg === "--permission-mode") {
      const value = next() as PermissionMode;
      if (!["ask", "auto", "read-only"].includes(value))
        throw new Error("invalid permission mode");
      options.permissionMode = value;
    } else if (arg === "--max-turns") options.maxTurns = Number(next());
    else if (arg === "--max-tool-calls") options.maxToolCalls = Number(next());
    else if (arg === "--timeout") options.timeoutMs = duration(next());
    else if (arg === "--model") options.model = next();
    else if (arg === "--variant") options.variant = next();
    else if (arg === "--log-level") {
      const value = next() as NonNullable<CliOptions["logLevel"]>;
      if (!["silent", "error", "warn", "info", "debug"].includes(value)) {
        throw new Error("invalid log level");
      }
      options.logLevel = value;
    } else if (arg === "--telemetry") options.telemetry = true;
    else if (arg === "--no-telemetry") options.telemetry = false;
    else if (arg === "upgrade") positional.push(arg);
    else if (arg.startsWith("-")) throw new Error(`unknown option: ${arg}`);
    else positional.push(arg);
  }
  if (
    options.interactive &&
    (options.nonInteractive || positional.length || stdin.trim())
  )
    throw new Error(
      "--interactive cannot be combined with a prompt or --non-interactive",
    );
  if (options.session && options.newSession)
    throw new Error("--session cannot be combined with --new-session");
  if (
    !Number.isInteger(options.maxTurns) ||
    !Number.isInteger(options.maxToolCalls) ||
    options.maxTurns < 1 ||
    options.maxToolCalls < 1
  ) {
    throw new Error("execution limits must be positive integers");
  }
  options.prompt = [stdin.trim(), ...positional].filter(Boolean).join("\n\n");
  return options;
}

export const cliHelp = `Usage: cagent [OPTIONS] [PROMPT...]

  cagent "Analyze this project"       Run without the interactive TUI
  cat task.md | cagent                Read a prompt from stdin

Options:
  -p, --prompt TEXT       Add a prompt
  -f, --file PATH         Add a file to the context (repeatable)
  -d, --directory PATH    Add a directory to the context (repeatable)
      --interactive       Force the TUI
      --non-interactive   Force headless execution
      --session ID        Continue an existing session
      --new-session       Start a new session (default)
      --yes               Approve tool requests automatically
      --permission-mode MODE  ask, auto, or read-only
      --output FORMAT     human (default) or jsonl
      --max-turns N       Maximum turns (default: 20)
      --max-tool-calls N  Maximum tool calls (default: 50)
      --timeout DURATION  For example 10m (default: 10m)
      --model ROUTE       Select a model route
      --variant NAME      Select a model reasoning variant
      --log-level LEVEL   Control startup logs: silent (default), error, info, debug
      --telemetry         Enable local telemetry for this run
      --no-telemetry      Disable local telemetry for this run
  -h, --help              Show this help

Exit codes: 0 success, 1 agent error, 2 invalid arguments, 3 permission denied,
4 provider/configuration error, 124 timeout, 130 SIGINT, 143 SIGTERM.
`;
