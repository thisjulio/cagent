# AGENTS.md — cagent

Code agent com arquitetura de plugins: o núcleo (loop de agente + contexto + sessões + terminal UI) é a caixa; tudo o resto — provedores, ferramentas, integrações — é plugin. Stack: Bun/TypeScript (ADR-0004). Leia `CONTEXT.md` (glossário) e `docs/adr/` (decisões) antes de trabalhar.

## Regras de arquitetura (imutáveis)

- Nenhuma funcionalidade entra no núcleo: provedores, ferramentas e integrações são sempre plugins (ADR-0001)
- Core e plugins são TypeScript sobre Bun; UI em ink; nenhum Rust/FFI/cdylib (ADR-0004)
- Crash de plugin: tool calls são envoltas em try/catch; crash não tratado derruba o processo (ADR-0003); valide plugins com testes
- Sem dependências entre plugins na v1; plugins usam apenas serviços do núcleo
- Sem modo headless na v1; sem ferramenta de "rodar testes" (workflow do usuário via bash)

## Responsabilidades do núcleo

- Loop de agente (mensagem → LLM → tool call → resultado)
- Montagem do system prompt (schemas de tools + seções de plugins)
- Janela de contexto, compactação (threshold + `/compact`), sessões JSONL (auto-resume, listagem)
- Pipeline de tools: pre-execute (allow/deny/ask) → execute → post-execute
- Permissões: allowlist por prefixo + aprovação inline no chat
- Retry de LLM com política por provedor
- Event bus: `session/*` durável, `agent/*` live, `tools/*` pipeline
- Registry de serviços por chaves (`llm`, `tools`, …)
- Terminal UI (ink): multi-pane chat + tool log + status bar; Esc = interrupt/steer; `/model`, `/sessions`, `/compact`

## Workspace

```
package.json          # Bun workspaces: core, sdk, plugins/*
core/                 # binário, loop, registry, eventos, UI
sdk/                # SDK de plugins (interfaces, registry, eventos, config)
plugins/openai/       # provedor (package TS)
plugins/bash/         # ferramenta (package TS)
plugins/code-tools/   # ferramenta (package TS)
```

## Desenvolvimento de plugins

- Todos os plugins (incluindo os base) são construídos sobre o package `sdk`
- Um plugin é um package TS carregado via dynamic import que se registra no registry (chave `llm` para provedores, `tools` para ferramentas) e assina eventos
- Tool = JSON schema + `execute(args)`; a pipeline de permissão é do núcleo, não da tool
- Provedor = `list_models()`, `prepare_call()`, `stream()` (chunks de token); auth e credenciais via config
- Config: `~/.cagent/config.yml` (global) + `cagent.yml` (override por projeto) + fallback em env vars; plugins habilitáveis por config

## Comandos

- `bun install` — instala dependências do workspace
- `bun test` — testa core e plugins
- `bun start` — roda o agente (UI quando disponível; modo por linhas antes da Fase 6)

`plugins/stub` é o exemplo mínimo de plugin (ver `plugins/stub/src/index.ts` para o padrão de registro).

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
