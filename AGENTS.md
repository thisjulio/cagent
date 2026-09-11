# AGENTS.md — cagent

Code agent com arquitetura de plugins: o núcleo (loop de agente + contexto + sessões + terminal UI) é a caixa; tudo o resto — provedores, ferramentas, integrações — é plugin. Stack: Bun/TypeScript (ADR-0004). Leia `CONTEXT.md` (glossário) e `docs/adr/` (decisões) antes de trabalhar.

## Regras de arquitetura (imutáveis)
- Conferir demais regras em `docs/adr/` e `CONTEXT.md`; decisões de arquitetura são imutáveis, mas podem ser revistas em ADRs futuras.


## Workspace

```
package.json          # Bun workspaces: core, sdk, plugins/*
core/                 # binário, loop, registry, eventos, UI
core/scripts/         # snap.tsx — snapshot de UI (obrigatório após mudança de UI)
sdk/                  # SDK de plugins (interfaces, registry, eventos, config)
plugins/stub/         # exemplo mínimo de plugin
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

## UI (ink) — obrigatório

- Antes de qualquer trabalho de UI, use a skill `ink-ui` (`.opencode/skills/ink-ui/SKILL.md`): desfaz o modelo mental "React web" (célula ≠ pixel, Yoga ≠ CSS, `<Box>`/`<Text>` não se misturam, `string-width` ≠ `.length`, `<Static>` para logs).
- Antes de implementar qualquer tela: desenhar wireframe ASCII de 80 colunas no plano e **esperar aprovação** do usuário.
- Após qualquer mudança de UI: rodar `bun core/scripts/snap.tsx` e comparar o snapshot (60/80/120 cols) com o wireframe aprovado — critério objetivo de pronto/não pronto.
- Para capturar estados de foco/navegação (não só o estado inicial), usar `stdin.write` do ink-testing-library (ver skill).

## Comandos

- `bun install` — instala dependências do workspace
- `bun test` — testa core e plugins; `bun test core/test/loop.test.ts` para um arquivo específico
- `bun start` — roda o agente (UI ink)
- `bun core/scripts/snap.tsx` — snapshot de UI em 3 larguras (obrigatório após mudança de UI)

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
