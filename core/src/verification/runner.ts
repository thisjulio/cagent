import { spawn } from "node:child_process";

export type VerificationResult = {
  passed: boolean;
  output: string;
};

export type VerificationRunner = {
  run(): Promise<VerificationResult>;
};

const MAX_OUTPUT = 12_000;

function formatOutput(stdout: string, stderr: string): string {
  const text = [stdout.trim(), stderr.trim()]
    .filter(Boolean)
    .join("\n[stderr]\n");
  return text.length > MAX_OUTPUT
    ? `${text.slice(0, MAX_OUTPUT)}\n[output truncated]`
    : text;
}

function runVerify(cwd: string): Promise<VerificationResult> {
  return new Promise((resolve) => {
    const child = spawn("bun", ["run", "verify"], {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
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
