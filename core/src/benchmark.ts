import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { InMemoryObservability, trace, type Attributes } from "@cagent/sdk";

export type ProcessSnapshot = {
  rssBytes: number;
  userCpuMicros?: number;
  systemCpuMicros?: number;
  readBytes?: number;
  writeBytes?: number;
};

export type BenchmarkResult = {
  name: string;
  durationMs: number;
  start: ProcessSnapshot;
  end: ProcessSnapshot;
  metrics: InMemoryObservability;
};

function readLinuxIo(): Pick<ProcessSnapshot, "readBytes" | "writeBytes"> {
  try {
    const values = readFileSync("/proc/self/io", "utf8").split("\n");
    const get = (key: string) =>
      Number(
        values.find((line) => line.startsWith(`${key}:`))?.split(/\s+/)[1],
      );
    return { readBytes: get("read_bytes"), writeBytes: get("write_bytes") };
  } catch {
    return {};
  }
}

function snapshot(): ProcessSnapshot {
  const usage = process.resourceUsage?.();
  return {
    rssBytes: process.memoryUsage().rss,
    userCpuMicros: usage?.userCPUTime,
    systemCpuMicros: usage?.systemCPUTime,
    ...readLinuxIo(),
  };
}

export async function benchmark<T>(
  name: string,
  operation: () => T | Promise<T>,
  attributes: Attributes = {},
): Promise<BenchmarkResult & { value: T }> {
  const metrics = new InMemoryObservability();
  const start = snapshot();
  const started = performance.now();
  const value = await trace(metrics, name, () => operation(), attributes);
  const end = snapshot();
  const durationMs = performance.now() - started;
  metrics.recordMetric(`${name}.duration_ms`, durationMs, attributes);
  metrics.recordMetric(
    `${name}.rss_delta_bytes`,
    end.rssBytes - start.rssBytes,
    attributes,
  );
  return { name, durationMs, start, end, metrics, value };
}
