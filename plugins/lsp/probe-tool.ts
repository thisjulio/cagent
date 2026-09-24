import register from "./src/index";
import type { PluginContext, ToolDefinition } from "@cagent/sdk";
import path from "node:path";

const registered: ToolDefinition[] = [];
const ctx: PluginContext = {
  name: "lsp",
  config: {},
  observability: {} as PluginContext["observability"],
  registerTool: (tool) => {
    registered.push(tool);
  },
  registerHook: () => {},
  registerProvider: () => {},
  registerSubagent: () => {},
  emit: () => {},
  on: () => {},
  registerContextExtension: () => {},
  storage: {} as PluginContext["storage"],
  diagnostics: {} as PluginContext["diagnostics"],
  promptSection: () => {},
  registerCommandSource: () => {},
  registerCommand: () => {},
  registerSkillSource: () => {},
  contributeContext: async () => [],
  activity: () => {},
  registerCleanup: () => {},
};

await register(ctx);
const tool = registered.find((t) => t.name === "lsp");
if (!tool) {
  console.log("lsp tool NOT registered");
  process.exit(1);
}

const file = path.resolve("../../core/src/lsp/doctor.ts");

// LspStatus is declared on line 9 (1-based). Target character 10 sits inside "LspStatus".
const refs = await tool.execute({
  operation: "references",
  path: file,
  line: 9,
  character: 10,
});
console.log("--- references ---");
console.log(refs.output);
console.log("isError:", refs.isError ?? false);

const def = await tool.execute({
  operation: "definition",
  path: file,
  line: 9,
  character: 10,
});
console.log("--- definition ---");
console.log(def.output);
console.log("isError:", def.isError ?? false);

const hover = await tool.execute({
  operation: "hover",
  path: file,
  line: 9,
  character: 10,
});
console.log("--- hover ---");
console.log(hover.output);
console.log("isError:", hover.isError ?? false);
