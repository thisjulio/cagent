# Roadmap — cagent v1

Stack: Bun/TypeScript (ADR-0004/ADR-0006). UI: OpenTUI. Each phase ends in a demonstrable state. The order follows `docs/adr/` and `CONTEXT.md`.

## Phase 1 — Workspace and core skeleton

- Bun monorepo: `package.json` with `core`, `sdk`, and `plugins/*` workspaces
- Crates → packages: `core` (binary), `sdk`, `plugins/openai`, `plugins/bash`, `plugins/code-tools`
- Config: `~/.cagent/config.yml` (global) + `cagent.yml` (project override) + env var fallback
- Plugin loader: dynamic import from the YAML list, enable/disable
- Service registry (`llm`, `tools` keys) + complete event bus (`session/*` durable, `agent/*` live, `tools/*` pipeline)
- `sdk` package: `ProviderAdapter` and `Tool` interfaces, registry, events, config, prompt section injection
- **Exit criteria:** `bun install` + `bun run` pass; a stub plugin is loaded via dynamic import and its tool is discovered in the registry (test).

## Phase 2 — Bash plugin

- Command execution tool (execa/child_process): streamed stdout/stderr, configurable timeout, working directory
- Command-prefix allowlist; outside the list → approval (the prompt flow itself comes in Phase 6)
- **Exit criteria:** tool executes through the registry and passes tests with real commands.

## Phase 3 — OpenAI plugin (provider)

- `openai` SDK (npm) + OAuth PKCE auth in the browser; token persisted in YAML config
- `list_models()`, `prepare_call()`, `stream()` (token chunks)
- Temporary verification: line-based terminal chat mode (replaced by the OpenTUI UI in Phase 6)
- **Exit criteria:** real conversation with streaming using OpenAI.

## Phase 4 — Agent loop (core)

- Prompt assembly: system prompt + tool schemas + sections injected by plugins
- Loop: request through `llm` registry → tool calls → `tools` pipeline (pre-execute allow/deny/ask → execute → post-execute) → result back to the LLM
- Sessions: append-only JSONL per session, new by default, listing/restoring through `/sessions`
- Core retry with per-provider policy (attempts, backoff)
- Automatic compaction by threshold + manual `/compact`
- Esc interrupts generation + steer during the stream
- **Exit criteria:** multi-turn conversation with working tool calls in line mode; resume works.

## Phase 5 — Code tools plugin

- Code search (fast-glob + in-process grep, respecting `.gitignore`)
- Line-based file editing
- Code templates (language-specific boilerplate) + prompt templates
- **Exit criteria:** the agent searches and edits files in a real conversation.

## Phase 6 — Terminal UI (OpenTUI)

- Multi-pane: chat (main) + tool log (side) + status bar (model, provider, tokens, context %)
- Streaming render; `/model` (fuzzy picker), `/sessions`, `/compact`, `/help`
- Esc to interrupt/steer; `ctrl+o` expands/collapses the last tool; `y/n/a` for approval (a = always allow this command, session allowlist)
- Live tool items in chat (appear while the tool runs); markdown with syntax highlighting in responses
- Remove line-based mode
- **Exit criteria:** complete interactive session usable end to end.

## Phase 7 — Hardening

- Error handling and display, allowlist UX in config, performance (startup, redraw), tests, SDK guide in `docs/`, packaging/release
- **Exit criteria:** v1 released.
