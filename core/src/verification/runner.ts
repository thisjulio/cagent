import { spawn } from "node:child_process";

export type VerificationResult = {
  passed: boolean;
  output: string;
};

export type VerificationRunner = {
  run(): Promise<VerificationResult>;
};

const MAX_OUTPUT = 4000;

function appendOutput(current: string, chunk: Buffer): string {
  const next = current + chunk.toString("utf8");
  return next.length <= MAX_OUTPUT ? next : next.slice(0, MAX_OUTPUT);
}

function formatOutput(stdout: string, stderr: string): string {
  const text = [stdout.trim(), stderr.trim()]
    .filter(Boolean)
    .join("\n[stderr]\n");
  return text.length > MAX_OUTPUT
    ? `${text.slice(0, MAX_OUTPUT)}\n[output truncated]`
    : text;
}

// ponytail: per-turn verification runs the incremental typecheck only;
// the full `bun run verify` stays a manual pre-completion gate.
function runVerify(cwd: string): Promise<VerificationResult> {
  return new Promise((resolve) => {
    const child = spawn("bun", ["run", "typecheck"], {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout = appendOutput(stdout, chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = appendOutput(stderr, chunk);
    });
    child.on("error", (error) => {
      resolve({
        passed: false,
        output: `verification could not start: ${error.message}`,
      });
    });
    child.on("close", (code) => {
      resolve({ passed: code === 0, output: formatOutput(stdout, stderr) });
    });
  });
}

export function createVerificationRunner(cwd: string): VerificationRunner {
  return { run: () => runVerify(cwd) };
}
