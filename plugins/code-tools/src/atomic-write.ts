import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function atomicWrite(absPath: string, content: string): void {
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  const tmp = path.join(os.tmpdir(), `cagent-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, absPath);
}
