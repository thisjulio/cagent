import path from "node:path";
import { createRequire } from "node:module";

export function resolveBinary(name: string): string {
  if (name !== "biome") return name;
  const require = createRequire(
    path.join(import.meta.dir, "..", "package.json"),
  );
  try {
    return require.resolve("@biomejs/biome/bin/biome");
  } catch {
    return name;
  }
}
