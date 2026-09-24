import path from "node:path";
import fs from "node:fs";

// ponytail: resolve local bin relative to this file's directory,
// not process.cwd(), so the plugin works regardless of how it is loaded.
const binDir = path.resolve(import.meta.dir, "..", "node_modules", ".bin");

export function resolveBinary(name: string): string {
  const local = path.join(binDir, name);
  if (fs.existsSync(local)) return local;
  return name;
}
