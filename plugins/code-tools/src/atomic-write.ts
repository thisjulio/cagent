import fs from "node:fs";
import path from "node:path";

export function atomicWrite(absPath: string, content: string): void {
  const directory = path.dirname(absPath);
  fs.mkdirSync(directory, { recursive: true });
  const tmp = path.join(
    directory,
    `.cagent-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  try {
    fs.writeFileSync(tmp, content);
    fs.renameSync(tmp, absPath);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}
