import fs from "node:fs";
import path from "node:path";
import { root } from "./state";

export function guardPath(input: string): string {
  const ROOT = root();
  const abs = path.resolve(ROOT, input);
  const real = path.join(
    fs.realpathSync(path.dirname(abs)),
    path.basename(abs),
  );
  if (real !== ROOT && !real.startsWith(ROOT + path.sep))
    throw new Error(`outside workspace: ${real}`);
  return real;
}
