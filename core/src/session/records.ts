import fs from "node:fs";
import type { SessionRecord } from "./types";

export function readSessionRecords(file: string): SessionRecord[] {
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const lines = text.split("\n");
  const records: SessionRecord[] = [];
  for (let index = 0; index < lines.length; index++) {
    if (!lines[index]) continue;
    try {
      records.push(JSON.parse(lines[index]!) as SessionRecord);
    } catch (error) {
      if (index === lines.length - 1) break;
      throw error;
    }
  }
  return records;
}

export function normalizeSessionRecords(
  records: SessionRecord[],
): SessionRecord[] {
  let turnSeq = 0;
  let currentTurn: string | null = null;
  for (const record of records) {
    if (record.type === "user") {
      turnSeq++;
      currentTurn = `legacy-${turnSeq}`;
    }
    if (!record.turnId) record.turnId = currentTurn ?? `legacy-${turnSeq}`;
  }
  return records;
}

// Restoration changes the active branch without rewriting the audit log.
export function projectSessionRecords(
  records: SessionRecord[],
): SessionRecord[] {
  let active: SessionRecord[] = [];
  for (const record of records) {
    if (record.type === "meta" && record.payload.kind === "session-restored") {
      const boundary = active.findIndex(
        (entry) =>
          entry.turnId === record.payload.beforeTurnId &&
          (entry.payload.kind === "workspace-checkpoint" ||
            entry.type === "user"),
      );
      if (boundary < 0)
        throw new Error("Invalid persisted restoration boundary");
      active = active.slice(0, boundary);
    } else active.push(record);
  }
  return active;
}

export function effectiveSessionRecords(
  records: SessionRecord[],
): SessionRecord[] {
  const compacted = records.findLastIndex(
    (record) =>
      record.type === "meta" &&
      (record.payload.kind === "checkpoint" ||
        record.payload.kind === "compacted"),
  );
  if (compacted === -1) return records;
  return [
    ...records
      .slice(0, compacted)
      .filter(
        (record) => record.type === "meta" && record.payload.kind === "title",
      ),
    ...records.slice(compacted),
  ];
}
