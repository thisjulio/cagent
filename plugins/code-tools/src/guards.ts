import fs from "node:fs";
import path from "node:path";
import { root } from "./state";

export function guardPath(input: string): string {
  const ROOT = root();
  const abs = path.resolve(ROOT, input);
  const missing: string[] = [];
  let parent = path.dirname(abs);
  while (true) {
    try {
      fs.lstatSync(parent);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const next = path.dirname(parent);
      if (next === parent) throw error;
      missing.unshift(path.basename(parent));
      parent = next;
    }
  }
  parent = path.join(fs.realpathSync(parent), ...missing);
  const real = path.join(parent, path.basename(abs));
  if (real !== ROOT && !real.startsWith(ROOT + path.sep))
    throw new Error(`outside workspace: ${real}`);
  return real;
}
