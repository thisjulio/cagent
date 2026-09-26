import fs from "node:fs";
import path from "node:path";
import { defineTool, type PluginContext, type ToolArgs } from "@cagent/sdk";
import { errorText } from "./errors";
import { runCmd } from "./exec";
import { gitignorePatterns } from "./gitignore";
import { guardPath } from "./guards";
import { root } from "./state";

const MAX_MATCHES = 200;
const RG_BIN = "/usr/bin/rg";

function notIgnored(file: string, ignored: string[]): boolean {
  return !ignored.some((pattern) => new Bun.Glob(pattern).match(file));
}

async function rgSearch(
  pattern: string,
  abs: string,
  max: number,
): Promise<string | null> {
  const ROOT = root();
  const r = await runCmd(RG_BIN, ["-n", "--color=never", pattern, abs], {
    cwd: ROOT,
    timeoutMs: 30_000,
  });
  if (r.code !== 0 && r.code !== 1) return null;
  const lines = r.stdout.split("\n").filter((l) => l.length > 0);
  return lines.slice(0, max).join("\n") || "no results";
}

async function searchTarget(
  pattern: string,
  target: string,
  max: number,
): Promise<string> {
  let abs: string;
  try {
    abs = guardPath(target);
  } catch (e) {
    throw new Error(
      `E_PATH:${target}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  if (!fs.existsSync(abs)) throw new Error(`E_NOT_FOUND:${target}`);
  if (fs.existsSync(RG_BIN)) {
    const output = await rgSearch(pattern, abs, max);
    if (output) return output;
  }
  return jsSearch(pattern, abs, max);
}

function evidenceFromOutput(output: string) {
  return output
    .split("\n")
    .map((line) => {
      const match = line.match(/^(.+?):(\d+):/);
      return match
        ? { path: match[1], line: Number(match[2]), kind: "code" as const }
        : undefined;
    })
    .filter((item): item is { path: string; line: number; kind: "code" } =>
      Boolean(item),
    );
}

// ponytail: JS fallback ignores .gitignore negations; rg is the default path.
async function jsSearch(
  pattern: string,
  abs: string,
  max: number,
): Promise<string> {
  const ROOT = root();
  const re = new RegExp(pattern, "i");
  const relative = path.relative(ROOT, abs) || ".";
  const stat = fs.statSync(abs);
  const glob = stat.isDirectory()
    ? relative === "."
      ? "**/*"
      : `${relative}/**/*`
    : relative;
  const files = stat.isDirectory()
    ? [
        ...new Bun.Glob(glob).scanSync({
          cwd: ROOT,
          onlyFiles: true,
          dot: true,
        }),
      ].filter((file) => notIgnored(file, gitignorePatterns(ROOT)))
    : [relative];
  const matches: string[] = [];
  for (const file of files) {
    let text: string;
    try {
      const buf = fs.readFileSync(path.join(ROOT, file));
      if (buf.includes(0)) continue;
      text = buf.toString("utf8");
    } catch {
      continue;
    }
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (!re.test(lines[i])) continue;
      matches.push(`${file}:${i + 1}: ${lines[i].trim()}`);
      if (matches.length >= max) return matches.join("\n");
    }
  }
  return matches.length ? matches.join("\n") : "no results";
}

export function searchTool(ctx: PluginContext) {
  return defineTool(
    "search",
    "Searches workspace files with a regex (rg when available, JS fallback; respects .gitignore). Returns 'path:line: text'.",
    {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Regex (case-insensitive)" },
        target: {
          type: "string",
          description: "File or directory (default: workspace)",
        },
        targets: {
          type: "array",
          items: { type: "string" },
          description: "Multiple files or directories to search",
        },
        max_matches: {
          type: "number",
          description: `Max matches (default ${MAX_MATCHES})`,
        },
      },
      required: ["pattern"],
    },
    async (args: ToolArgs) => {
      const pattern = String(args.pattern ?? "");
      if (!pattern)
        return { output: errorText("E_PARSE", "empty pattern"), isError: true };
      const rawTargets = args.targets;
      const targets = Array.isArray(rawTargets)
        ? rawTargets.map(String)
        : [String(args.target ?? ".")];
      const max = Math.min(
        MAX_MATCHES,
        Math.max(1, Math.trunc(Number(args.max_matches ?? MAX_MATCHES))),
      );
      try {
        const chunks: string[] = [];
        let remaining = max;
        for (const target of targets) {
          if (remaining <= 0) break;
          const output = await searchTarget(pattern, target, remaining);
          if (output !== "no results") {
            const lines = output.split("\n").slice(0, remaining);
            chunks.push(...lines);
            remaining -= lines.length;
          }
        }
        const output = chunks.join("\n") || "no results";
        const count = chunks.length;
        return {
          output,
          summary: count ? `${count} matches` : "no matches",
          evidence: evidenceFromOutput(output),
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        const separator = message.indexOf(":");
        const code = separator === -1 ? "E_PARSE" : message.slice(0, separator);
        const detail =
          separator === -1 ? message : message.slice(separator + 1);
        return {
          output: errorText(code as Parameters<typeof errorText>[0], detail),
          isError: true,
        };
      }
    },
    { readOnly: true },
  );
}
