import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { LocalFileObservability, createLocalObservability } from "../src/local-telemetry";

describe("local telemetry", () => {
  test("writes spans, metrics and events as JSONL", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cagent-telemetry-"));
    const file = path.join(directory, "events.jsonl");
    const telemetry = new LocalFileObservability(file);
    const span = telemetry.startSpan("test.operation", { scenario: "unit" });
    span.addEvent("step", { count: 1 });
    span.end();
    telemetry.recordMetric("test.duration_ms", 2);
    telemetry.recordEvent("test.completed", { ok: true });
    telemetry.flush?.();

    const records = fs.readFileSync(file, "utf8").trim().split("\n").map((line) => JSON.parse(line));
    expect(records.map((record) => record.type)).toEqual(["span", "metric", "event"]);
    expect(records[0].name).toBe("test.operation");
    expect(records[0].attributes.scenario).toBe("unit");
    expect(records[0].attributes["process.rss_bytes"]).toBeNumber();
    expect(records[0].attributes["process.user_cpu_us"]).toBeNumber();
    expect(records[1].value).toBe(2);
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
  });

  test("does not retain records when telemetry is disabled", () => {
    const telemetry = createLocalObservability(false);
    telemetry.recordEvent("test.disabled");
    telemetry.recordMetric("test.disabled", 1);
    telemetry.startSpan("test.disabled").end();
    expect(telemetry).toBeDefined();
    expect("events" in telemetry).toBe(false);
  });
});