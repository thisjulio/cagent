import { test, expect } from "bun:test";
import { loadConfig } from "../src/config";
import { EventBus } from "../src/events";
import { loadPlugins } from "../src/loader";
import { Registry } from "../src/registry";

test("carrega plugin e descobre tool no registry", async () => {
  const registry = new Registry();
  const bus = new EventBus();
  const config = loadConfig(import.meta.dirname);
  const { contexts } = await loadPlugins({ plugins: [{ name: "stub", path: "./plugins/stub" }], allowlist: [] }, registry, bus);
  expect(contexts.length).toBe(1);
  expect(registry.tools().map((t) => t.name)).toEqual(["echo"]);
  expect(config.model).toBeUndefined();
});

test("tool registrada executa e retorna resultado", async () => {
  const registry = new Registry();
  await loadPlugins({ plugins: [{ name: "stub", path: "./plugins/stub" }], allowlist: [] }, registry, new EventBus());
  const result = await registry.tool("echo")!.execute({ text: "olá" });
  expect(result.output).toBe("olá");
});

test("event bus: waterfall transforma payload, emit notifica", () => {
  const bus = new EventBus();
  let notified: unknown = null;
  bus.on("agent/step", (p) => (notified = p));
  bus.on("tools/pre-execute", (p) => ({ action: "deny", reason: "teste", ...p }));

  bus.emit("agent/step", { step: 1 });
  expect(notified).toEqual({ step: 1 });

  const out = bus.waterfall("tools/pre-execute", { command: "rm -rf /" });
  expect(out).toEqual({ action: "deny", reason: "teste", command: "rm -rf /" });
});
