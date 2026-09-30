import fs from "node:fs/promises";
import path from "node:path";
import ignore, { type Ignore } from "ignore";

type Scope = { directory: string; rules: Ignore };
export type IgnoreScopes = Scope[];

export async function loadRules(
  root: string,
  directory: string,
  inherited: IgnoreScopes,
): Promise<IgnoreScopes> {
  const file = path.join(root, directory, ".gitignore");
  try {
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.size > 256_000) return inherited;
    const rules = ignore({ ignorecase: false }).add(
      await fs.readFile(file, "utf8"),
    );
    return [...inherited, { directory, rules }];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return inherited;
    throw error;
  }
}

export function ignored(
  scopes: IgnoreScopes,
  relative: string,
  directory: boolean,
): boolean {
  let excluded = false;
  for (const scope of scopes) {
    const local = path.posix.relative(scope.directory || ".", relative);
    const result = scope.rules.test(local + (directory ? "/" : ""));
    if (result.ignored) excluded = true;
    else if (result.unignored) excluded = false;
  }
  return excluded;
}
