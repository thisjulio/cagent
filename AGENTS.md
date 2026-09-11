# AGENTS.md — cagent

Code agent com arquitetura de plugins: o núcleo (loop de agente · contexto · sessões · UI de terminal) é a caixa; provedores, ferramentas e integrações são plugins. Stack: Bun/TypeScript (ADR-0004).

Leia antes de trabalhar: `CONTEXT.md` (glossário) e `docs/adr/` (decisões). ADRs valem como lei enquanto estiverem vigentes — para mudar uma decisão, escreva uma ADR nova; nunca escreva código contra uma ADR em vigor.

## Comandos

- `bun install` — dependências do workspace
- `bun test` — core + plugins (`bun test core/test/loop.test.ts` para um arquivo só)
- `bun start` — roda o agente
- `bun core/scripts/snap.tsx` — snapshot da UI em 60/80/120 colunas
- `graphify update .` — atualiza o grafo de conhecimento (AST, sem custo de API)

## Workspace

```
package.json          # Bun workspaces: core, sdk, plugins/*
core/                 # binário, loop, registry, eventos, UI
core/scripts/         # snap.tsx — snapshot de UI
sdk/                  # interfaces de plugin, registry, eventos, config
plugins/stub/         # exemplo mínimo de plugin (padrão de registro)
plugins/openai/       # provedor
plugins/bash/         # ferramenta
plugins/code-tools/   # ferramenta
```

## Como se orientar no código

- Pergunta sobre o código: rode `graphify query "<pergunta>"` antes de grep ou leitura ampla — devolve um subgrafo pequeno em vez do repositório inteiro. `graphify path "<A>" "<B>"` para relações entre dois pontos, `graphify explain "<conceito>"` para um conceito isolado.
- `graphify-out/wiki/index.md` para navegação ampla. `graphify-out/GRAPH_REPORT.md` só para revisão de arquitetura, quando query/path/explain não trouxerem contexto suficiente.
- Arquivos sujos em `graphify-out/` são esperados (hooks e updates incrementais) e não são motivo para pular o graphify. Pule apenas se a tarefa for sobre grafo desatualizado/incorreto ou se o usuário pedir.
- Se o usuário digitar `/graphify`, use a skill graphify antes de qualquer outra coisa.

## Limites de módulo (verificáveis)

- Um arquivo = uma responsabilidade que cabe em uma frase sem "e".
- Máx. 250 linhas por arquivo, 40 por função, 4 parâmetros (acima disso, objeto de options).
- Estourou o limite? Extrair **antes** de continuar a tarefa. Não existe "refatoro depois".
- Componente React: só layout e formatação. Zero I/O, zero regra de negócio, zero mutação de estado.
- Módulo de lógica (controller, loop, session, registry): não importa `ink`, `react` nem nada de UI.
- Função pura (parsing, fuzzy, split, formatação) mora em arquivo próprio e é testada sem render.
- Proibido `utils.ts`, `helpers.ts`, `misc.ts`, `common.ts` — o nome do arquivo nomeia o domínio.

## Direção de dependências

```
ui → controller → domínio (loop · session · registry) → sdk
```

- Setas só apontam para a direita. Import contra a seta quebra `core/test/arch.test.ts`.
- O núcleo nunca importa de `plugins/*`; conhece apenas as interfaces do `sdk`.
- Dependência entra por construtor ou parâmetro (ver `ControllerDeps`), nunca por import de singleton.

## Extensão sem edição

- Funcionalidade nova = módulo novo registrado, não `if` novo em função existente.
- Slash-commands, ferramentas e provedores vivem em registry. Se você precisou de um branch novo em `submit()` para adicionar um comando, o registry é que está faltando — crie-o.
- Mapa de despacho substitui cadeia de if/else a partir de 3 casos.

## Onde criar código novo (default = arquivo novo)

| O que você está escrevendo   | Onde vai                            |
|------------------------------|-------------------------------------|
| componente ink               | `core/src/ui/components/<Nome>.tsx`  |
| formatação/realce de texto   | `core/src/ui/render/`                |
| comando de barra             | `core/src/commands/<nome>.ts`        |
| regra de estado/orquestração | `core/src/controller/`               |
| persistência de sessão       | `core/src/session/`                  |

Só acrescente a um arquivo existente se a mudança for do mesmo conceito já nomeado nele.

## UI (ink)

- Antes de qualquer trabalho de UI, use a skill `ink-ui` (`.opencode/skills/ink-ui/SKILL.md`): ela desfaz o modelo mental "React web" — célula ≠ pixel, Yoga ≠ CSS, `<Box>`/`<Text>` não se misturam, `string-width` ≠ `.length`, `<Static>` para logs.
- Antes de implementar qualquer tela: desenhar wireframe ASCII de 80 colunas no plano e **esperar aprovação** do usuário.
- Depois de qualquer mudança de UI: rodar `bun core/scripts/snap.tsx` e comparar os três snapshots com o wireframe aprovado. Esse é o critério objetivo de pronto/não pronto.
- Para capturar estados de foco e navegação (não só o estado inicial), use `stdin.write` do ink-testing-library (ver skill).
- `<Static>` nunca remove itens do scrollback: para esvaziar a tela (`/new`, `/sessions`), limpe via `\x1b[3J\x1b[2J\x1b[H` em `process.stdout` (ver `clearScrollback`).

## Plugins

- Todo plugin — inclusive os base — é construído sobre o package `sdk`.
- Plugin = package TS carregado por dynamic import que se registra no registry (chave `llm` para provedores, `tools` para ferramentas) e assina eventos.
- Tool = JSON schema + `execute(args)`. A pipeline de permissão é do núcleo, não da tool.
- Provedor = `list_models()`, `prepare_call()`, `stream()` (chunks de token). Auth e credenciais vêm da config.
- Config: `~/.cagent/config.yml` (global) + `cagent.yml` (override por projeto) + fallback em env vars. Plugins são habilitáveis por config.
- Padrão de registro: `plugins/stub/src/index.ts`.

## Convenções

- Comentário `// ponytail:` marca decisão não óbvia ou armadilha conhecida — explica o *porquê*, nunca o *o quê*. Se a linha só reformula o código, apague.

## Definition of done

- [ ] `bun test` verde, incluindo `core/test/arch.test.ts`
- [ ] nenhum arquivo tocado passou de 250 linhas
- [ ] código novo no lugar previsto pela tabela acima — nada acrescentado a `app.tsx`
- [ ] mexeu em UI: snapshot rodado e comparado ao wireframe aprovado
- [ ] `graphify update .` rodado ao final