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

  load(): SessionLoad {
    if (!fs.existsSync(this.file))
      return { records: [], messages: [], queuedMessages: [] };
    const records = effectiveSessionRecords(
      normalizeSessionRecords(readSessionRecords(this.file)),
    );
    return {
      records,
      messages: recordsToMessages(records),
      queuedMessages: restoreQueue(records),
      modelSelection: restoreModelSelection(records),
    };
  }

  static list(dir?: string): SessionSummary[] {
    return listSessions(dir);
  }

  static latestUserMessage(dir?: string): string | null {
    return latestUserMessage(dir);
  }
}
