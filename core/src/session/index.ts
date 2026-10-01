import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { repairSessionTail } from "./repair-tail";
import {
  effectiveSessionRecords,
  projectSessionRecords,
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

  history(): SessionRecord[] {
    return projectSessionRecords(
      normalizeSessionRecords(readSessionRecords(this.file)),
    );
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
    const serialized = `${JSON.stringify(record)}\n`;
    const fd = fs.openSync(this.file, "a+");
    try {
      repairSessionTail(fd);
      fs.writeFileSync(fd, serialized);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    updateSessionIndex(this.file, record);
  }

  fork(): Session {
    const records = this.history();
    const snapshot = readSnapshot(this.snapshotFile);
    if (
      snapshot &&
      records.some(
        (record) => record.type === "user" && record.turnId === snapshot.turnId,
      ) &&
      !records.some(
        (record) =>
          record.type === "assistant" && record.turnId === snapshot.turnId,
      )
    )
      records.push(snapshot as unknown as SessionRecord);
    const fork = new Session(undefined, path.dirname(this.file));
    const temporary = `${fork.file}.tmp`;
    const fd = fs.openSync(temporary, "wx");
    try {
      fs.writeFileSync(
        fd,
        records.map((record) => `${JSON.stringify(record)}\n`).join(""),
      );
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(temporary, fork.file);
    return fork;
  }

  restoreBefore(turnId: string, metadata: Record<string, unknown>): void {
    projectSessionRecords([
      ...this.history(),
      {
        ts: Date.now(),
        type: "meta",
        payload: { kind: "session-restored", beforeTurnId: turnId },
      },
    ]);
    const size = fs.existsSync(this.file) ? fs.statSync(this.file).size : 0;
    const fd = fs.openSync(this.file, "a");
    try {
      fs.writeSync(
        fd,
        `${JSON.stringify({ ts: Date.now(), type: "meta", payload: { ...metadata, kind: "session-restored", beforeTurnId: turnId } })}\n`,
      );
      fs.fsyncSync(fd);
    } catch (error) {
      fs.ftruncateSync(fd, size);
      fs.fsyncSync(fd);
      throw error;
    } finally {
      fs.closeSync(fd);
    }
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
    const history = this.history();
    const records = effectiveSessionRecords(history);
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
      rawRecords.some(
        (record) => record.type === "user" && record.turnId === snapshot.turnId,
      ) &&
      !rawRecords.some(
        (record) =>
          record.type === "assistant" && record.turnId === snapshot.turnId,
      )
    )
      visibleRecords.push({ ...snapshot, type: "assistant" });
    return {
      records: visibleRecords,
      messages: recordsToMessages(visibleRecords),
      queuedMessages: restoreQueue(history),
      modelSelection: restoreModelSelection(history),
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
