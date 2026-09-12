import { expect, test } from "bun:test";
import { EventBus } from "../../../core/src/events";
import { Registry } from "../../../core/src/registry";
import { loadPlugins } from "../../../core/src/loader";

test("bash runs a command and streams stdout", async () => {
  const registry = new Registry();
  const bus = new EventBus();
  const chunks: string[] = [];
  bus.on("tools/stdout", (p) => {
    chunks.push(String((p as { chunk: string }).chunk));
  });

  await loadPlugins(
    { plugins: [{ name: "bash", path: "./plugins/bash" }], allowlist: [] },
    registry,
    bus,
  );

  const result = (await registry.tool("bash")!.execute({ command: "echo hi" })) as {
    output: string;
    isError?: boolean;
  };

  expect(result.output).toBe("hi\n");
  expect(result.isError).toBe(false);
  expect(chunks.join("")).toBe("hi\n");
});

test("bash respects the timeout", async () => {
  const registry = new Registry();
  const bus = new EventBus();

  await loadPlugins(
    { plugins: [{ name: "bash", path: "./plugins/bash" }], allowlist: [] },
    registry,
    bus,
  );

  const started = Date.now();
  const result = (await registry.tool("bash")!.execute({
    command: "sleep 5",
    timeout_ms: 300,
  })) as { output: string; isError?: boolean; timedOut?: boolean };

  expect(result.timedOut).toBe(true);
  expect(result.isError).toBe(true);
  expect(Date.now() - started).toBeLessThan(3000);
});

test("bash limits accumulated output", async () => {
  const registry = new Registry();
  const bus = new EventBus();
  await loadPlugins(
    { plugins: [{ name: "bash", path: "./plugins/bash" }], allowlist: [] },
    registry,
    bus,
  );
  const result = await registry.tool("bash")!.execute({ command: "yes x | head -c 200000" });
  expect(result.output).toContain("output truncated");
  expect(result.output.length).toBeLessThan(132000);
});
