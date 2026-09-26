import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const LIMIT = 500;
const SOURCE_ROOTS = ["core/src", "sdk/src", "plugins"];
const SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mts",
  ".cts",
  ".mjs",
  ".cjs",
]);
const EXCLUDED_DIRECTORY_NAMES = new Set([
  "node_modules",
  "test",
  "tests",
  "__tests__",
  "dist",
  "build",
  "coverage",
  "generated",
  "vendor",
]);

async function collectSourceFiles(directory: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".") || EXCLUDED_DIRECTORY_NAMES.has(entry.name))
      continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(fullPath)));
    } else if (
      entry.isFile() &&
      SOURCE_EXTENSIONS.has(path.extname(entry.name))
    ) {
      files.push(fullPath);
    }
  }
  return files;
}

async function main(): Promise<void> {
  const files = (await Promise.all(SOURCE_ROOTS.map(collectSourceFiles)))
    .flat()
    .sort();
  const violations: { file: string; lines: number }[] = [];

  for (const file of files) {
    const contents = await readFile(file, "utf8");
    const lines =
      contents.length === 0
        ? 0
        : contents.split(/\r\n|\n|\r/).length -
          (contents.endsWith("\n") || contents.endsWith("\r") ? 1 : 0);
    if (lines > LIMIT) violations.push({ file, lines });
  }

  if (violations.length > 0) {
    console.error(
      `Module limit exceeded: source files must not exceed ${LIMIT} lines.`,
    );
    for (const violation of violations)
      console.error(`  ${violation.file}: ${violation.lines} lines`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `Module line limit passed (${files.length} source files checked; maximum ${LIMIT} lines).`,
  );
}

if (import.meta.main) await main();

export { collectSourceFiles, LIMIT, SOURCE_ROOTS };
