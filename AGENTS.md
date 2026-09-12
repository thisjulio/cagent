# AGENTS.md - cagent

Code agent with a plugin architecture: the core (agent loop, context, sessions, and terminal UI) is the box; providers, tools, and integrations are plugins. Stack: Bun/TypeScript (ADR-0004).

Read before working: `CONTEXT.md` (glossary) and `docs/adr/` (decisions). ADRs are law while they are current: to change a decision, write a new ADR; never write code against an active ADR.

## Repository Language

- English is the required language for all repository artifacts: source code, identifiers, comments, tests, documentation, configuration, skill files, commit-facing text, and generated text checked into the repository.
- Keep user-facing conversational replies in the user's language when appropriate, but write anything saved to the repository in English.
- When modifying existing non-English repository text, translate the touched material to English unless the text is an intentional fixture or external content.

## Commands

- `bun install` - workspace dependencies
- `bun test` - core + plugins (`bun test core/test/loop.test.ts` for one file)
- `bun start` - run the agent
- `bun core/scripts/snap.tsx` - UI snapshot at 60/80/120 columns
- `graphify update .` - update the knowledge graph (AST, no API cost)

## Workspace

```
package.json          # Bun workspaces: core, sdk, plugins/*
core/                 # binary, loop, registry, events, UI
core/scripts/         # snap.tsx - UI snapshot
sdk/                  # plugin interfaces, registry, events, config
plugins/stub/         # minimal plugin example (registration pattern)
plugins/openai/       # provider
plugins/bash/         # tool
plugins/code-tools/   # tool
```

## Finding Your Way Around the Code

- For codebase questions, run `graphify query "<question>"` before grep or broad reading - it returns a small subgraph instead of the whole repository. Use `graphify path "<A>" "<B>"` for relationships between two points and `graphify explain "<concept>"` for an isolated concept.
- Use `graphify-out/wiki/index.md` for broad navigation. Use `graphify-out/GRAPH_REPORT.md` only for architecture review when query/path/explain is not enough.
- Dirty files in `graphify-out/` are expected (hooks and incremental updates) and are not a reason to skip graphify. Skip it only when the task concerns an outdated/incorrect graph or the user asks.
- If the user types `/graphify`, use the graphify skill before anything else.

## Module Limits (Verifiable)

- One file = one responsibility that fits in one sentence without "and".
- Maximum 250 lines per file, 40 per function, 4 parameters (above that, use an options object).
- If a limit is exceeded, extract **before** continuing. There is no "refactor later".
- React component: layout and formatting only. Zero I/O, business rules, or state mutation.
- Logic module (controller, loop, session, registry): must not import `ink`, `react`, or any UI dependency.
- Pure function (parsing, fuzzy matching, splitting, formatting) belongs in its own file and is tested without rendering.
- Forbidden filenames: `utils.ts`, `helpers.ts`, `misc.ts`, `common.ts` - the filename must name the domain.

## Dependency Direction

```
ui -> controller -> domain (loop, session, registry) -> sdk
```

- Arrows point only to the right. An import against the direction breaks `core/test/arch.test.ts`.
- The core never imports from `plugins/*`; it knows only the `sdk` interfaces.
- Dependencies enter through constructors or parameters (see `ControllerDeps`), never through singleton imports.

## Extension Without Editing

- New functionality = a new registered module, not a new `if` in an existing function.
- Slash commands, tools, and providers live in the registry. If adding a command required a new branch in `submit()`, the registry is missing something; create it.
- A dispatch map replaces an if/else chain starting at three cases.

## Where New Code Goes (default = new file)

| What you are writing        | Where it goes                         |
|-----------------------------|---------------------------------------|
| OpenTUI component           | `core/src/ui/components/<Name>.tsx`  |
| text formatting/highlighting| `core/src/ui/render/`                 |
| slash command               | `core/src/commands/<name>.ts`         |
| state/orchestration rule    | `core/src/controller/`                |
| session persistence         | `core/src/session/`                   |

Only add to an existing file when the change belongs to the same concept already named by that file.

## UI (OpenTUI)

- Before UI work, follow OpenTUI's terminal-cell layout, focus, input, and snapshot constraints.
- Before implementing any screen: draw an ASCII wireframe at 80 columns and **wait for user approval**.
- After any UI change: run `bun core/scripts/snap.tsx` and compare all three snapshots with the approved wireframe. This is the objective ready/not-ready criterion.
- Capture focus and navigation states, not only the initial state, in the UI tests.

## Plugins

- Every plugin, including base plugins, is built on the `sdk` package.
- Plugin = TypeScript package loaded by dynamic import that registers in the registry (`llm` for providers, `tools` for tools) and subscribes to events.
- Tool = JSON schema + `execute(args)`. The permission pipeline belongs to the core, not the tool.
- Provider = `list_models()`, `prepare_call()`, `stream()` (token chunks). Auth and credentials come from config.
- Config: `~/.cagent/config.yml` (global) + `cagent.yml` (project override) + env var fallback. Plugins can be enabled through config.
- Registration pattern: `plugins/stub/src/index.ts`.

## Conventions

- The comment `// ponytail:` marks a non-obvious decision or known trap - explain *why*, never *what*. If the line only restates the code, delete it.

## Definition of Done

- [ ] `bun test` passes, including `core/test/arch.test.ts`
- [ ] no touched file exceeds 250 lines
- [ ] new code is in the location specified by the table above - nothing added to `app.tsx`
- [ ] for UI changes: snapshot run and compared with the approved wireframe
- [ ] `graphify update .` run at the end
