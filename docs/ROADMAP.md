# Roadmap — cagent

Stack: Bun/TypeScript (ADR-0004/ADR-0006). UI: OpenTUI.

## Delivered

- **Phase 1 — Workspace and core skeleton.** Bun monorepo (`core`, `sdk`, `plugins/*`), layered config (`~/.cagent/config.yml` + `cagent.yml` + env), plugin loader via dynamic import, service registry (`llm`, `tools`) and event bus, `sdk` package with `ProviderAdapter`/`Tool` interfaces and prompt-section injection.
- **Phase 2 — Bash plugin.** Command execution with streamed stdout/stderr, configurable timeout, working directory, and a command-prefix allowlist.
- **Phase 3 — OpenAI provider.** `openai` SDK + Codex OAuth PKCE (browser) and `OPENAI_API_KEY`, `list_models()` / `prepare_call()` / `stream()`, stale-persisted-model fallback (ADR-0012).
- **Phase 4 — Agent loop.** Prompt assembly with plugin-injected sections, the `llm` → `tools` pipeline (allow/deny/ask → execute → post), append-only JSONL sessions with `/sessions`, per-provider retry, automatic + manual compaction, and Esc interrupt/steer.
- **Phase 5 — Code tools plugin.** Workspace search (fast-glob + in-process grep, `.gitignore`-aware), line-based and patch-based editing, and AST structural search via `@ast-grep/napi`.
- **Phase 6 — Terminal UI (OpenTUI).** Multi-pane chat + tool log + status bar (model, provider, tokens, context %), streaming render, `/model` fuzzy picker, `/sessions`, `/compact`, `/help`, live tool items, markdown with syntax highlighting, and approval flow (`y/n/a`). Line-based mode removed.
- **Subagents (ADR-0007).** Native subagent runtime in the core (`core/src/subagents/`), `agents/*.md` discovery, built-in `general` subagent, and optional Claude/Codex harness adapters.
- **Generic plugin workflow extensions (ADR-0008).** SDK contracts for lifecycle events, command registration, prompt/context contribution, session-history observation, namespaced plugin storage, and plugin config.
- **Cross-cutting observability (ADR-0010).** Vendor-neutral `Observability` contract in the SDK; default no-op; opt-in local file exporter (`local-telemetry.ts`); instrumentation across loop, controller, subagents, tools, sessions, and UI.
- **Hooks.** Native hook API through the SDK (`before_tool`, `after_tool`, `session_start`, `user_prompt_submit`, `subagent_start`); optional Claude hooks adapter (`plugins/claude-hooks`).
- **Persistent user preferences.** `/preference` command (add/edit/list/remove/toggle); enabled preferences injected into the system prompt on every submission. This replaced the original local-memory plugin direction (ADR-0009/0011) with a simpler, text-only mechanism.
- **Task workflows.** `tasks` tool with create/add/list/next/skip/block/resume/activate/clear operations; controller integration and observability events.
- **MCP tools.** `plugins/mcp` plugin with stdio and HTTP transports; MCP tools registered in the registry and classified as `mcptool`.
- **LSP plugin.** `plugins/lsp` plugin with server management and LSP tool registration.
- **Release packaging.** Linux and macOS binaries (`x64`/`arm64`), `install.sh` with SHA-256 verification, `cagent upgrade`, and GitHub release workflow.

## In progress — Phase 7 hardening

- Error handling and display.
- Allowlist persistence to config (currently session-only, see `core/src/controller/controller.ts`).
- Performance (startup, redraw).
- Test coverage across the grown plugin surface.
- SDK authoring guide in `docs/`.
- Packaging/release stability.
- **Exit criteria:** v1.0 released.

## Potential evolutions

Direction, not committed. Each item should land as a new ADR before implementation when it touches an active decision.

- **Provider breadth.** More providers through the `sdk` interface (for example Anthropic, local gateways) without core changes.
- **Observability export.** OTLP adapter, console exporter, and richer metrics beyond the current local file.
- **Session and context ergonomics.** Richer `/sessions` filtering, cross-session search, and context-window budgeting surfaced in the status bar.
- **Permission model.** A persistent, per-repo allowlist and scoped permission profiles beyond the current session allowlist.
- **Editing surfaces.** Additional provider-native editing surfaces and matching-ladder tuning (see `CONTEXT.md` editing terms).
- **Documentation.** SDK authoring guide, plugin example, and troubleshooting for the grown plugin set.
