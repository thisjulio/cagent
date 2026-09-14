import { expect, test } from "bun:test";
import { memoryTools } from "../src/commands";
import { createMemoryCommand } from "../src/plugin-command";
import { openStore } from "../src/sqlite-storage";

test("memory plugin command routes slash subcommands to tools", async () => {
  const store = openStore("/tmp/memory-command-test.sqlite");
  const tools = memoryTools(store, { retrieval: false, capture: true });
  const command = createMemoryCommand(tools);
  expect(await command.execute({ name: "memory", arguments: "status", values: {} })).toContain("Memory plugin: enabled");
  expect(await command.execute({ name: "memory", arguments: "retrieval on", values: {} })).toContain("Retrieval enabled");
  expect(await command.execute({ name: "memory", arguments: "unknown", values: {} })).toContain("Usage:");
  store.close();
});
