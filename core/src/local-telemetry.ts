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
  private buffer: string = "";
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    file = path.join(os.homedir(), ".cagent", "telemetry", "events.jsonl"),
  ) {
    this.file = resolveTelemetryPath(file);
    fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
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
      fs.appendFileSync(this.file, this.buffer, { mode: 0o600 });
      this.buffer = "";
    }
  }

  private enqueue(record: TelemetryRecord): void {
    this.buffer += `${JSON.stringify(record)}\n`;
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null;
        this.flush();
      }, 100);
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
