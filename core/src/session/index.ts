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
import { latestUserMessage, listSessions, sessionDirectory } from "./listing";
import type {
  QueueMessage,
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
  }

  replaceAssistantSnapshot(turnId: string | undefined, content: string): void {
    const records = fs.existsSync(this.file)
      ? readSessionRecords(this.file)
      : [];
    const snapshotIndex = records.findLastIndex(
      (record) =>
        String(record.type) === "snapshot" && record.turnId === turnId,
    );
    const record: SessionSnapshotRecord = {
      ts: Date.now(),
      turnId,
      type: "snapshot",
      payload: { content },
    };
    if (snapshotIndex === -1) records.push(record as unknown as SessionRecord);
    else records[snapshotIndex] = record as unknown as SessionRecord;
    fs.writeFileSync(
      this.file,
      `${records.map((entry) => JSON.stringify(entry)).join("\n")}\n`,
    );
  }

  load(): SessionLoad {
    if (!fs.existsSync(this.file))
      return { records: [], messages: [], queuedMessages: [] };
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
