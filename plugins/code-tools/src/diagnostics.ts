import fs from "node:fs";
import path from "node:path";
import { runCmd } from "./exec";

export async function tscErrors(cwd: string): Promise<string[]> {
  const r = await runCmd("bun", ["x", "tsc", "--noEmit"], { cwd, timeoutMs: 60_000 });
  return r.code === 0 ? [] : r.stderr.split("\n").filter((l) => l.includes("error TS"));
}

export async function runFormat(cwd: string): Promise<string | undefined> {
  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(cwd, "package.json"), "utf8"));
  } catch {
    return undefined;
  }
  const format = (pkg.scripts as Record<string, string> | undefined)?.format;
  if (!format) return undefined;
  const r = await runCmd("bun", ["run", "format"], { cwd, timeoutMs: 60_000 });
  return r.stdout.trim() ? r.stdout.slice(0, 500) : undefined;
}
