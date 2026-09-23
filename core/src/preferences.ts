import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "js-yaml";

export type UserPreference = {
  id: number;
  text: string;
  enabled: boolean;
};

export const MAX_PREFERENCE_LENGTH = 500;

export function preferenceFile(): string {
  return path.join(os.homedir(), ".cagent", "config.yml");
}

export function loadPreferences(file = preferenceFile()): UserPreference[] {
  if (!fs.existsSync(file)) return [];
  const data = yaml.load(fs.readFileSync(file, "utf8")) as Record<
    string,
    unknown
  > | null;
  const values = data?.preferences;
  if (!Array.isArray(values)) return [];
  return values.filter(isPreference).map((item) => ({ ...item }));
}

export function savePreferences(
  preferences: UserPreference[],
  file = preferenceFile(),
): void {
  const data = fs.existsSync(file)
    ? ((yaml.load(fs.readFileSync(file, "utf8")) as Record<
        string,
        unknown
      > | null) ?? {})
    : {};
  data.preferences = preferences;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, yaml.dump(data, { noRefs: true }));
}

function isPreference(value: unknown): value is UserPreference {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    Number.isInteger(item.id) &&
    typeof item.text === "string" &&
    typeof item.enabled === "boolean"
  );
}
