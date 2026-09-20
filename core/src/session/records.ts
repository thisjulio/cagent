import fs from "node:fs";
import type { SessionRecord } from "./types";

export function readSessionRecords(file: string): SessionRecord[] {
  try {
    return fs
      .readFileSync(file, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as SessionRecord);
  } catch {
    return [];
  }
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

export function effectiveSessionRecords(
  records: SessionRecord[],
): SessionRecord[] {
  const compacted = records.findLastIndex(
    (record) => record.type === "meta" && record.payload.kind === "compacted",
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
