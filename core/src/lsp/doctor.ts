import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type LspLanguage = "ts" | "biome" | "py" | "rs";
export type LspStatus = "ok" | "missing" | "unconfigured";

export type LspServer = {
  language: LspLanguage;
  binary: string;
  version: string;
  status: LspStatus;
  detail?: string;
};

const servers: Record<LspLanguage, { binary: string; detail: string }> = {
  ts: {
    binary: "typescript-language-server",
    detail: ".ts,.tsx,.js (fan-out with biome)",
  },
  biome: {
    binary: "biome",
    detail: ".ts,.js,.json (fan-out with typescript)",
  },
  py: { binary: "pyright", detail: ".py,.pyi" },
  rs: { binary: "rust-analyzer", detail: ".rs" },
};

export async function detectLspServers(
  cwd: string,
  pathValue = process.env.PATH ?? "",
): Promise<LspServer[]> {
  const active = detectProjectLanguages(cwd);
  const results: LspServer[] = [];
  for (const [language, meta] of Object.entries(servers) as [
    LspLanguage,
    { binary: string; detail: string },
  ][]) {
    if (!active.has(language)) {
      results.push({
        language,
        binary: meta.binary,
        version: "-",
        status: "unconfigured",
        detail: meta.detail,
      });
      continue;
    }
    const executable = findExecutable(meta.binary, pathValue, cwd);
    if (!executable) {
      results.push({
        language,
        binary: meta.binary,
        version: "-",
        status: "missing",
        detail: meta.detail,
      });
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
        binary: meta.binary,
        version: (stdout || stderr).trim().split(/\s+/).at(-1) ?? "unknown",
        status: "ok",
        detail: meta.detail,
      });
    } catch {
      results.push({
        language,
        binary: meta.binary,
        version: "-",
        status: "missing",
        detail: meta.detail,
      });
    }
  }
  return results;
}

function detectProjectLanguages(cwd: string): Set<LspLanguage> {
  let files: string[] = [];
  try {
    files = fs.readdirSync(cwd);
  } catch {
    return new Set();
  }
  const languages = new Set<LspLanguage>();
  const hasTs = files.some((file) =>
    /^(tsconfig\.json|.*\.(ts|tsx|jsx|js|mjs|cjs))$/.test(file),
  );
  const hasJson = files.some((file) => /.*\.(json|jsonc)$/.test(file));
  const hasBiomeConfig = files.some((file) => /^biome\.jsonc?/.test(file));
  if (hasTs) languages.add("ts");
  if (hasTs || hasJson || hasBiomeConfig) languages.add("biome");
  if (
    files.some((file) =>
      /^(pyproject\.toml|requirements\.txt|.*\.py)$/.test(file),
    )
  )
    languages.add("py");
  if (files.includes("Cargo.toml")) languages.add("rs");
  return languages;
}

function findExecutable(
  binary: string,
  pathValue: string,
  cwd: string,
): string | undefined {
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
  for (const directory of [
    path.join(cwd, "plugins", "lsp", "node_modules", ".bin", binary),
    path.join(cwd, "node_modules", ".bin", binary),
  ]) {
    try {
      fs.accessSync(directory, fs.constants.X_OK);
      return directory;
    } catch {
      // Continue searching bundled locations.
    }
  }
  return undefined;
}
