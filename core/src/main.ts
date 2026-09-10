import readline from "node:readline/promises";
import type { Message } from "@cagent/sdk";
import { loadConfig } from "./config";
import { EventBus } from "./events";
import { loadPlugins } from "./loader";
import { Registry } from "./registry";

async function main(): Promise<void> {
  const config = loadConfig(process.cwd());
  const registry = new Registry();
  const bus = new EventBus();
  const { contexts } = await loadPlugins(config, registry, bus);

  console.log(`plugins: ${contexts.map((c) => c.name).join(", ") || "(nenhum)"}`);
  console.log(`tools: ${registry.tools().map((t) => t.name).join(", ") || "(nenhum)"}`);
  console.log(`provedores: ${[...registry.providers().keys()].join(", ") || "(nenhum)"}`);

  const route = registry.providers().keys().next().value;
  if (!route) {
    console.log("(sem provedor — nada a fazer)");
    return;
  }
  const adapter = registry.provider(route)!;
  const model = config.model ?? (await adapter.list_models())[0];
  console.log(`modelo: ${model}`);

  const messages: Message[] = [
    { role: "system", content: "Você é o cagent, um assistente de terminal. Responda de forma curta e prática." },
  ];
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  for (;;) {
    let line: string;
    try {
      line = (await rl.question("você> ")).trim();
    } catch {
      break;
    }
    if (!line) continue;
    if (line === "exit" || line === "sair") break;
    messages.push({ role: "user", content: line });

    const opts = await adapter.prepare_call({ model, messages, tools: [] });
    let full = "";
    process.stdout.write("cagent> ");
    for await (const chunk of adapter.stream(opts)) {
      if (chunk.type === "text") {
        full += chunk.text;
        process.stdout.write(chunk.text);
      } else if (chunk.type === "finish") {
        if (chunk.usage) {
          console.log(`\n[uso: ${chunk.usage.input_tokens} in / ${chunk.usage.output_tokens} out]`);
        }
      }
    }
    messages.push({ role: "assistant", content: full });
  }
  rl.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
