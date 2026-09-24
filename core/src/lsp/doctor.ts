import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type LspLanguage = "ts" | "py" | "rs";
export type LspStatus = "ok" | "missing" | "unconfigured";

export type LspServer = {
  language: LspLanguage;
  binary: string;
  version: string;
  status: LspStatus;
};

const servers: Record<LspLanguage, string> = {
  ts: "typescript-language-server",
  py: "pyright",
  rs: "rust-analyzer",
};

export async function detectLspServers(
  cwd: string,
  pathValue = process.env.PATH ?? "",
): Promise<LspServer[]> {
  const active = detectProjectLanguages(cwd);
  const results: LspServer[] = [];
  for (const [language, binary] of Object.entries(servers) as [
    LspLanguage,
    string,
  ][]) {
    if (!active.has(language)) {
      results.push({ language, binary, version: "-", status: "unconfigured" });
      continue;
    }
    const executable = findExecutable(binary, pathValue);
    if (!executable) {
      results.push({ language, binary, version: "-", status: "missing" });
      continue;
    }
    try {
      const { stdout, stderr } = await execFileAsync(
        executable,
        ["--version"],
        {
          timeout: 5000,
          windowsHide: true,
        },
      );
      results.push({
        language,
        binary,
        version: (stdout || stderr).trim().split(/\s+/).at(-1) ?? "unknown",
        status: "ok",
      });
    } catch {
      results.push({ language, binary, version: "-", status: "missing" });
    }
  }
  return results;
}

function detectProjectLanguages(cwd: string): Set<LspLanguage> {
  const files = fs.readdirSync(cwd);
  const languages = new Set<LspLanguage>();
  if (files.some((file) => /^(tsconfig\.json|.*\.(ts|tsx|jsx|js))$/.test(file)))
    languages.add("ts");
  if (
    files.some((file) =>
      /^(pyproject\.toml|requirements\.txt|.*\.py)$/.test(file),
    )
  )
    languages.add("py");
  if (files.includes("Cargo.toml")) languages.add("rs");
  return languages;
}

function findExecutable(binary: string, pathValue: string): string | undefined {
  for (const directory of pathValue.split(path.delimiter)) {
    if (!directory) continue;
    const candidate = path.join(directory, binary);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // Continue searching PATH.
    }
  }
  return undefined;
}
