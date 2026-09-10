# Roadmap — cagent v1

Stack: Bun/TypeScript (ADR-0004). UI: ink. Cada fase termina num estado demoável. Ordem segue `docs/adr/` e `CONTEXT.md`.

## Fase 1 — Workspace e esqueleto do núcleo

- Monorepo Bun: `package.json` com workspaces `core`, `sdk`, `plugins/*`
- Crates → packages: `core` (binário), `sdk`, `plugins/openai`, `plugins/bash`, `plugins/code-tools`
- Config: `~/.cagent/config.yml` (global) + `cagent.yml` (override por projeto) + fallback em env vars
- Loader de plugins: dynamic import a partir da lista YAML, enable/disable
- Registry de serviços (chaves `llm`, `tools`) + event bus completo (`session/*` durável, `agent/*` live, `tools/*` pipeline)
- Package `sdk`: interfaces `ProviderAdapter` e `Tool`, registry, eventos, config, injeção de seções de prompt
- **Critério de saída:** `bun install` + `bun run` passam; um plugin stub é carregado via dynamic import e sua tool é descoberta no registry (teste).

## Fase 2 — Plugin bash

- Tool de execução de comandos (execa/child_process): stdout/stderr streamados, timeout configurável, working dir
- Allowlist por prefixo de comando; fora da lista → aprovação (fluxo de prompt em si vem na Fase 6)
- **Critério de saída:** tool executa via registry e passa em testes com comandos reais.

## Fase 3 — Plugin OpenAI (provedor)

- SDK `openai` (npm) + auth OAuth PKCE no browser; token persistido na config YAML
- `list_models()`, `prepare_call()`, `stream()` (chunks de token)
- Verificação temporária: modo de chat por linhas em terminal (substituído pela UI ink na Fase 6)
- **Critério de saída:** conversa real com streaming usando OpenAI.

## Fase 4 — Loop de agente (núcleo)

- Montagem do prompt: system prompt + schemas de tools + seções injetadas por plugins
- Loop: request via registry `llm` → tool calls → pipeline `tools` (pre-execute allow/deny/ask → execute → post-execute) → resultado de volta ao LLM
- Sessões: JSONL append-only por sessão, auto-resume, listagem
- Retry no núcleo com política por provedor (tentativas, backoff)
- Compactação automática por threshold + `/compact` manual
- Esc interrompe a geração + steer no meio do stream
- **Critério de saída:** conversa multi-turno com tool calls funcionando no modo por linhas; resume funciona.

## Fase 5 — Plugin code tools

- Busca de código (fast-glob + grep em-processo, respeitando `.gitignore`)
- Edição line-based de arquivos
- Templates de código (boilerplate por linguagem) + templates de prompt
- **Critério de saída:** o agente busca e edita arquivos numa conversa real.

## Fase 6 — Terminal UI (ink)

- Multi-pane: chat (principal) + tool log (lateral) + status bar (modelo, provedor, tokens)
- Render em streaming; `/model` (picker fuzzy), `/sessions`, `/compact`
- Esc para interrupt/steer; prompt de aprovação inline no chat
- Remoção do modo por linhas
- **Critério de saída:** sessão interativa completa, usável de ponta a ponta.

## Fase 7 — Endurecimento

- Tratamento e exibição de erros, UX da allowlist na config, performance (startup, redraw), testes, guia do SDK em `docs/`, empacotamento/release
- **Critério de saída:** v1 liberada.
