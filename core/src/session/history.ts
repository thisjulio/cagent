import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

export type HistoryEntry = { ts: number; text: string };

function encodeBase32(value: Buffer): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz234567";
  let bits = 0;
  let buffer = 0;
  let result = "";

  for (const byte of value) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += alphabet[(buffer >>> bits) & 31];
    }
  }

  if (bits > 0) {
    result += alphabet[(buffer << (5 - bits)) & 31];
  }

  return result;
}

export function historyFile(cwd: string): string {
  const hash = encodeBase32(crypto.createHash("sha256").update(cwd).digest());
  const dir = path.join(os.homedir(), ".cagent", "history");
  return path.join(dir, `${hash}.jsonl`);
}

export function appendPrompt(cwd: string, text: string): void {
  const file = historyFile(cwd);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const entry = JSON.stringify({ ts: Date.now(), text });
  fs.appendFileSync(file, entry + "\n");
}

export function loadHistory(cwd: string): HistoryEntry[] {
  const file = historyFile(cwd);
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, "utf-8").split("\n").filter(Boolean);
  return lines.map((line) => {
    const obj = JSON.parse(line);
    return { ts: Number(obj.ts), text: String(obj.text ?? "") };
  });
}

export function searchHistory(cwd: string, query: string): HistoryEntry[] {
  const all = loadHistory(cwd);
  const haystacks = all.map((entry) => entry.text);
  const fuzzy = (haystacks: string[], q: string): string[] => {
    if (!q) return haystacks;
    const needle = q.toLowerCase();
    return haystacks.filter((h) => h.toLowerCase().includes(needle));
  };
  const matched = fuzzy(haystacks, query);
  const matchedSet = new Set(matched);
  return all.filter((entry) => matchedSet.has(entry.text));
}
