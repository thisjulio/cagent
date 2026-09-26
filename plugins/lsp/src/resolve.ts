import path from "node:path";
import fs from "node:fs";

export function resolveBinary(name: string): string {
  const packageRoot = path.resolve(import.meta.dir, "..");
  const candidates = [
    path.join(packageRoot, "node_modules", ".bin", name),
    path.join(packageRoot, "node_modules", "@biomejs", "biome", "bin", name),
    path.join(
      packageRoot,
      "node_modules",
      "@biomejs",
      "biome",
      "bin",
      `${name}.exe`,
    ),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? name;
}
