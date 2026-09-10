import readline from "node:readline/promises";
import type { ToolArgs, ToolDefinition } from "@cagent/sdk";
import { loadConfig } from "./config";
import { EventBus } from "./events";
import { loadPlugins } from "./loader";
import { runTurn, streamOnce } from "./loop";
import { Registry } from "./registry";
import { buildSystemPrompt } from "./prompt";
import { Session, estimateTokens, serializeMessages } from "./session";
import type { ToolAsk } from "./tools";

async function main(): Promise<void> {
  const config = loadConfig(process.cwd());
  const registry = new Registry();
  const bus = new EventBus();
  const { contexts, promptSections } = await loadPlugins(config, registry, bus);

  const route = registry.llmRoute();
  if (!route) {
    console.log("(sem provedor — nada a fazer)");
    return;
  }
  const adapter = registry.provider(route)!;
  const model = config.model ?? (await adapter.list_models())[0];
  console.log(`plugins: ${contexts.map((c) => c.name).join(", ") || "(nenhum)"}`);
  console.log(`tools: ${registry.tools().map((t) => t.name).join(", ") || "(nenhum)"}`);
  console.log(`provedor: ${route} | modelo: ${model}`);

  const session = new Session();
  const loaded = session.load();
  if (loaded.records.length) {
    console.log(`resumindo sessão ${session.id} (${loaded.messages.length} mensagens)`);
  }
  const messages = [
    { role: "system" as const, content: buildSystemPrompt(promptSections) },
    ...loaded.messages,
  ];

  const state = { interrupted: false };
  process.on("SIGINT", () => {
    state.interrupted = true;
  });

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const ask: ToolAsk = async (tool: ToolDefinition, args: ToolArgs) => {
    const cmd = typeof args.command === "string" ? args.command : JSON.stringify(args);
    const answer = (await rl.question(`→ ${tool.name} ${cmd}\n   permitir? (y/n) `)).trim().toLowerCase();
    return answer === "y";
  };

  const compact = async (): Promise<void> => {
    const threshold = config.compact_threshold_tokens ?? 60_000;
    const est = estimateTokens(messages);
    if (est < threshold) {
      console.log(`sem compactação (${est} < ${threshold} tokens)`);
      return;
    }
    const keep = 10;
    if (messages.length <= keep + 1) {
      console.log("(pouco para compactar)");
      return;
    }
    const old = messages.slice(1, messages.length - keep);
    const { text: summary } = await streamOnce({
      adapter,
      model,
      messages: [
        {
          role: "system",
          content: "Resuma a conversa abaixo em até 5 linhas, preservando decisões, comandos executados e resultados relevantes.",
        },
        { role: "user", content: serializeMessages(old) },
      ],
      tools: [],
    });
    const rest = messages.slice(messages.length - keep);
    messages.length = 1;
    messages.push({ role: "user", content: `[resumo da conversa anterior]\n${summary}` }, ...rest);
    session.append({ ts: Date.now(), type: "meta", payload: { kind: "compacted", summary } });
    console.log(`[compactado: ${est} → ${estimateTokens(messages)} tokens]`);
  };

  for (;;) {
    let line: string;
    try {
      line = (await rl.question("você> ")).trim();
    } catch {
      if (state.interrupted) continue;
      break;
    }
    if (!line) continue;
    if (line === "exit" || line === "sair") break;
    if (line === "/compact") {
      await compact();
      continue;
    }
    if (line === "/sessions") {
      for (const s of Session.list()) {
        console.log(`${s.id}  ${s.updated}  ${s.preview}`);
      }
      continue;
    }
    state.interrupted = false;
    messages.push({ role: "user", content: line });
    session.append({ ts: Date.now(), type: "user", payload: { content: line } });

    process.stdout.write("cagent> ");
    const turn = await runTurn({
      adapter,
      model,
      messages,
      tools: registry.tools(),
      allowlist: config.allowlist,
      ask,
      bus,
      onText: (t) => process.stdout.write(t),
      interrupted: () => state.interrupted,
    });
    process.stdout.write("\n");
    for (const r of turn.records) {
      if (r.role === "assistant") {
        session.append({
          ts: Date.now(),
          type: "assistant",
          payload: { content: r.content, ...(r.tool_calls ? { tool_calls: r.tool_calls } : {}) },
        });
      } else {
        session.append({ ts: Date.now(), type: "tool", payload: { tool_call_id: r.tool_call_id, content: r.content, isError: r.isError } });
        process.stdout.write(`[tool] ${r.content.slice(0, 200)}\n`);
      }
    }
    if (turn.interrupted) process.stdout.write("[interrompido — Ctrl+C de novo para continuar; digite para steer]\n");
  }
  rl.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
