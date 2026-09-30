import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export function toolOutputLimit(contextWindow?: number): number {
  return contextWindow && Number.isFinite(contextWindow) && contextWindow > 0
    ? Math.max(512, Math.min(16_000, Math.floor(contextWindow * 0.04)))
    : 4000;
}

export async function prepareToolOutput(
  output: string,
  limit: number,
  directory?: string,
): Promise<string> {
  if (output.length <= limit) return output;
  let notice = "Full output retained in the transcript.";
  if (directory) {
    try {
      await mkdir(directory, { recursive: true });
      const file = path.join(directory, `${randomUUID()}.txt`);
      await writeFile(file, output, { mode: 0o600 });
      const lines = output.split("\n").length;
      notice = `Full output: ${JSON.stringify(file)} (${lines} lines). Use read_file with offset and limit to read more.`;
    } catch {
      notice =
        "Could not save full output; full output retained in the transcript.";
    }
  }
  const marker = `\n[tool output truncated; ${notice}]\n`;
  const available = Math.max(0, limit - marker.length);
  const head = Math.ceil(available / 2);
  const tail = Math.floor(available / 2);
  return output.slice(0, head) + marker + (tail ? output.slice(-tail) : "");
}
