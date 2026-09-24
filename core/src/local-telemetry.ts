import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import {
  noopObservability,
  type Attributes,
  type Observability,
  type Span,
} from "@cagent/sdk";

type ResourceSnapshot = {
  rss_bytes: number;
  user_cpu_us?: number;
  system_cpu_us?: number;
  read_bytes?: number;
  write_bytes?: number;
};

type TelemetryRecord = {
  type: "span" | "metric" | "event";
  timestamp: string;
  run_id: string;
  process_pid: number;
  [key: string]: unknown;
};

const MAX_BUFFER_CHARS = 1024 * 1024;
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const ROTATION_COUNT = 5;

// run.id is stable for the lifetime of the process
const RUN_ID = crypto.randomUUID();

const safeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const resolveTelemetryPath = (file: string): string => {
  const expanded =
    file === "~" || file.startsWith("~/")
      ? path.join(os.homedir(), file.slice(2))
      : file;
  return path.resolve(expanded);
};

const resourceSnapshot = (): ResourceSnapshot => {
  const usage = process.resourceUsage?.();
  const snapshot: ResourceSnapshot = {
    rss_bytes: process.memoryUsage().rss,
    user_cpu_us: usage?.userCPUTime,
    system_cpu_us: usage?.systemCPUTime,
  };
  try {
    for (const line of fs.readFileSync("/proc/self/io", "utf8").split("\n")) {
      const [key, value] = line.split(":");
      if (key === "read_bytes") snapshot.read_bytes = Number(value);
      if (key === "write_bytes") snapshot.write_bytes = Number(value);
    }
  } catch {
    // Linux I/O counters are optional.
  }

  return snapshot;
};

class FileSpan implements Span {
  readonly id: string;
  private readonly started = performance.now();
  private readonly startResources = resourceSnapshot();
  private readonly attributes: Attributes = {};
  private readonly events: { name: string; attributes?: Attributes }[] = [];
  private exception?: string;

  constructor(
    private readonly owner: LocalFileObservability,
    private readonly name: string,
    initial: Attributes,
  ) {
    this.id = crypto.randomUUID();
    Object.assign(this.attributes, initial);
  }

  setAttribute(name: string, value: string | number | boolean): void {
    this.attributes[name] = value;
  }
  addEvent(name: string, attributes?: Attributes): void {
    this.events.push({ name, attributes });
  }
  recordException(error: unknown): void {
    this.exception = safeError(error);
  }
  end(): void {
    const endResources = resourceSnapshot();
    const resources: Attributes = {
      "process.rss_bytes": endResources.rss_bytes,
      ...(endResources.user_cpu_us !== undefined &&
      this.startResources.user_cpu_us !== undefined
        ? {
            "process.user_cpu_us":
              endResources.user_cpu_us - this.startResources.user_cpu_us,
          }
        : {}),
      ...(endResources.system_cpu_us !== undefined &&
      this.startResources.system_cpu_us !== undefined
        ? {
            "process.system_cpu_us":
              endResources.system_cpu_us - this.startResources.system_cpu_us,
          }
        : {}),
      ...(endResources.read_bytes !== undefined &&
      this.startResources.read_bytes !== undefined
        ? {
            "process.read_bytes":
              endResources.read_bytes - this.startResources.read_bytes,
          }
        : {}),
      ...(endResources.write_bytes !== undefined &&
      this.startResources.write_bytes !== undefined
        ? {
            "process.write_bytes":
              endResources.write_bytes - this.startResources.write_bytes,
          }
        : {}),
    };
    this.owner.enqueue({
      type: "span",
      timestamp: new Date().toISOString(),
      run_id: RUN_ID,
      process_pid: process.pid,
      span_id: this.id,
      name: this.name,
      duration_ms: performance.now() - this.started,
      status: this.exception ? "error" : "ok",
      attributes: { ...this.attributes, ...resources },
      events: this.events,
      ...(this.exception ? { exception: this.exception } : {}),
    });
  }
}

export class LocalFileObservability implements Observability {
  private readonly file: string;
  private readonly maxFileBytes: number;
  private buffer: string = "";
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    file = path.join(os.homedir(), ".cagent", "telemetry", "events.jsonl"),
    maxFileBytes = MAX_FILE_BYTES,
  ) {
    this.file = resolveTelemetryPath(file);
    this.maxFileBytes = maxFileBytes;
    fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
  }

  summary(sessionId: string): {
    file: string;
    bytes: number;
    spans: number;
    events: number;
    metrics: number;
    providerCalls: number;
    agentTurns: number;
  } {
    this.flush();
    let spans = 0;
    let events = 0;
    let metrics = 0;
    let providerCalls = 0;
    let agentTurns = 0;
    const files = [
      this.file,
      ...Array.from(
        { length: ROTATION_COUNT },
        (_, index) => `${this.file}.${index + 1}`,
      ),
    ];
    for (const file of files) {
      if (!fs.existsSync(file)) continue;
      let content: string;
      try {
        content = fs.readFileSync(file, "utf8");
      } catch {
        continue;
      }
      for (const line of content.split("\n")) {
        if (!line) continue;
        try {
          const record = JSON.parse(line) as {
            type?: string;
            name?: string;
            attributes?: Record<string, unknown>;
          };
          if (record.attributes?.session_id !== sessionId) continue;
          if (record.type === "span") {
            spans++;
            if (record.name === "provider.stream") providerCalls++;
            if (record.name === "agent.turn") agentTurns++;
          } else if (record.type === "event") events++;
          else if (record.type === "metric") metrics++;
        } catch {
          // Ignore an incomplete or malformed JSONL record.
        }
      }
    }
    let bytes = 0;
    try {
      bytes = fs.statSync(this.file).size;
    } catch {
      // The event file is created on its first flush.
    }
    return {
      file: this.file,
      bytes,
      spans,
      events,
      metrics,
      providerCalls,
      agentTurns,
    };
  }

  startSpan(name: string, attributes: Attributes = {}): Span {
    return new FileSpan(this, name, attributes);
  }

  recordMetric(name: string, value: number, attributes?: Attributes): void {
    this.enqueue({
      type: "metric",
      timestamp: new Date().toISOString(),
      run_id: RUN_ID,
      process_pid: process.pid,
      name,
      value,
      attributes,
    });
  }

  recordEvent(name: string, attributes?: Attributes): void {
    this.enqueue({
      type: "event",
      timestamp: new Date().toISOString(),
      run_id: RUN_ID,
      process_pid: process.pid,
      name,
      attributes,
    });
  }

  flush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.buffer) {
      this.rotateIfNeeded(Buffer.byteLength(this.buffer));
      fs.appendFileSync(this.file, this.buffer, { mode: 0o600 });
      this.buffer = "";
    }
  }

  enqueue(record: TelemetryRecord): void {
    const serialized = `${JSON.stringify(record)}\n`;
    if (this.buffer.length + serialized.length > MAX_BUFFER_CHARS) {
      this.flush();
    }
    this.buffer += serialized;
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null;
        this.flush();
      }, 100);
    }
  }

  private rotateIfNeeded(incomingBytes: number): void {
    try {
      const size = fs.statSync(this.file).size;
      if (size + incomingBytes <= this.maxFileBytes) return;
      for (let index = ROTATION_COUNT; index >= 1; index--) {
        const source = index === 1 ? this.file : `${this.file}.${index - 1}`;
        const target = `${this.file}.${index}`;
        if (!fs.existsSync(source)) continue;
        if (index === ROTATION_COUNT) fs.rmSync(target, { force: true });
        fs.renameSync(source, target);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  private write(record: TelemetryRecord): void {
    try {
      fs.appendFileSync(this.file, `${JSON.stringify(record)}\n`, {
        mode: 0o600,
      });
    } catch {
      // Telemetry must never affect the application workflow.
    }
  }
}

export function createLocalObservability(
  enabled: boolean,
  file?: string,
): Observability {
  return enabled ? new LocalFileObservability(file) : noopObservability;
}
