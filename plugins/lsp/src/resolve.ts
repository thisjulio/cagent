import path from "node:path";
import { createRequire } from "node:module";

const bundled: Record<string, string> = {
  biome: "@biomejs/biome/bin/biome",
  "typescript-language-server": "typescript-language-server/lib/cli.mjs",
  "pyright-langserver": "pyright/langserver.index.js",
};

export function resolveBinary(name: string): string {
  const subpath = bundled[name];
  if (!subpath) return name;
  const require = createRequire(
    path.join(import.meta.dir, "..", "package.json"),
  );
  try {
    return require.resolve(subpath);
  } catch {
    return name;
  }
}
