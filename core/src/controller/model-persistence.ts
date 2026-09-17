import fs from "node:fs";
import os from "node:os";
import path from "node:path";

interface LastChoice {
  model?: string;
  variant?: string;
  timestamp: number;
}

function lastChoiceFile(): string {
  return path.join(os.homedir(), ".cagent", "last-model.json");
}

function isValidChoice(data: unknown): data is LastChoice {
  if (typeof data !== "object" || data === null) return false;
  const obj = data as Record<string, unknown>;
  if (obj.model !== undefined && typeof obj.model !== "string") return false;
  if (obj.variant !== undefined && typeof obj.variant !== "string") return false;
  if (typeof obj.timestamp !== "number") return false;
  return true;
}

export function saveLastChoice(model: string, variant?: string): void {
  const file = lastChoiceFile();
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const choice: LastChoice = { model, variant, timestamp: Date.now() };
    fs.writeFileSync(file, JSON.stringify(choice, null, 2));
  } catch {
    // ponytail: persistence failure should not crash model selection
  }
}

export function loadLastChoice(): LastChoice | null {
  const file = lastChoiceFile();
  try {
    if (!fs.existsSync(file)) return null;
    const raw = fs.readFileSync(file, "utf8");
    const parsed = JSON.parse(raw);
    if (!isValidChoice(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}
