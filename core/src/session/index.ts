import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  effectiveSessionRecords,
  normalizeSessionRecords,
  readSessionRecords,
} from "./records";
import { recordsToMessages, serializeMessages } from "./messages";
import { restoreModelSelection, restoreQueue } from "./queue";
import {
  latestUserMessage,
  listSessions,
  sessionDirectory,
  updateSessionIndex,
} from "./listing";
import type {
  SessionLoad,
  SessionModelSelection,
  SessionRecord,
  SessionSnapshotRecord,
  SessionSummary,
} from "./types";

export type {
  QueueMessage,
  SessionLoad,
  SessionModelSelection,
  SessionRecord,
  SessionSummary,
} from "./types";
export { serializeMessages };

export class Session {
  readonly id: string;
  readonly file: string;
  readonly snapshotFile: string;

  constructor(id?: string, dir?: string) {
    const base = sessionDirectory(dir);
    fs.mkdirSync(base, { recursive: true });
    if (id) {
      if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error("Invalid session id");
      this.id = id;
    } else {
      this.id = crypto.randomUUID();
    }
    this.file = path.join(base, `${this.id}.jsonl`);
    this.snapshotFile = path.join(base, `${this.id}.snapshot`);
  }

  appendModelSelection(selection: SessionModelSelection): void {
    this.append({
      ts: Date.now(),
      type: "meta",
      payload: { kind: "model-selection", ...selection },
    });
  }

  appendTasks(tasks: unknown[]): void {
    this.append({
      ts: Date.now(),
      type: "meta",
      payload: { kind: "tasks", tasks },
    });
  }

  append(record: SessionRecord): void {
    fs.appendFileSync(this.file, `${JSON.stringify(record)}\n`);
    updateSessionIndex(this.file, record);
  }

  appendAssistantSnapshot(turnId: string | undefined, content: string): void {
    const record: SessionSnapshotRecord = {
      ts: Date.now(),
      turnId,
      type: "snapshot",
      payload: { content },
    };
    fs.writeFileSync(this.snapshotFile, JSON.stringify(record));
  }

  clearAssistantSnapshot(): void {
    fs.rmSync(this.snapshotFile, { force: true });
  }

  load(): SessionLoad {
    if (!fs.existsSync(this.file)) {
      const snapshot = readSnapshot(this.snapshotFile);
      const records = snapshot
        ? [{ ...snapshot, type: "assistant" } as SessionRecord]
        : [];
      return {
        records,
        messages: recordsToMessages(records),
        queuedMessages: [],
      };
    }
    const records = effectiveSessionRecords(
      normalizeSessionRecords(readSessionRecords(this.file)),
    );
    const rawRecords = records as unknown as (SessionRecord & {
      type: string;
    })[];
    const latestSnapshots = new Map<string | undefined, SessionRecord>();
    for (const record of rawRecords)
      if (String(record.type) === "snapshot")
        latestSnapshots.set(record.turnId, record);
    for (const record of rawRecords)
      if (record.type === "assistant") latestSnapshots.delete(record.turnId);
    const visibleRecords: SessionRecord[] = [];
    for (const record of rawRecords) {
      if (String(record.type) === "snapshot") continue;
      if (record.type !== "assistant") {
        visibleRecords.push(record as SessionRecord);
        continue;
      }
      const snapshot = latestSnapshots.get(record.turnId);
      if (snapshot) {
        latestSnapshots.delete(record.turnId);
        visibleRecords.push({
          ...snapshot,
          type: "assistant",
        } as SessionRecord);
      } else {
        visibleRecords.push(record as SessionRecord);
      }
    }
    for (const snapshot of latestSnapshots.values())
      visibleRecords.push({ ...snapshot, type: "assistant" } as SessionRecord);
    const snapshot = readSnapshot(this.snapshotFile);
    if (
      snapshot &&
      !rawRecords.some(
        (record) =>
          record.type === "assistant" && record.turnId === snapshot.turnId,
      )
    )
      visibleRecords.push({ ...snapshot, type: "assistant" });
    return {
      records: visibleRecords,
      messages: recordsToMessages(visibleRecords),
      queuedMessages: restoreQueue(visibleRecords),
      modelSelection: restoreModelSelection(visibleRecords),
    };
  }

  static list(dir?: string): SessionSummary[] {
    return listSessions(dir);
  }

  static latestUserMessage(dir?: string): string | null {
    return latestUserMessage(dir);
  }
}

function readSnapshot(file: string): SessionSnapshotRecord | null {
  try {
    const record = JSON.parse(
      fs.readFileSync(file, "utf8"),
    ) as SessionSnapshotRecord;
    return record.type === "snapshot" ? record : null;
  } catch {
    return null;
  }
}
