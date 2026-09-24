# cagent

[![CI](https://github.com/thisjulio/cagent/actions/workflows/ci.yml/badge.svg)](https://github.com/thisjulio/cagent/actions/workflows/ci.yml)
[![Release](https://github.com/thisjulio/cagent/actions/workflows/release.yml/badge.svg)](https://github.com/thisjulio/cagent/actions/workflows/release.yml)
[![GitHub release](https://img.shields.io/github/v/release/thisjulio/cagent)](https://github.com/thisjulio/cagent/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/thisjulio/cagent/total)](https://github.com/thisjulio/cagent/releases)
[![License: MIT](https://img.shields.io/github/license/thisjulio/cagent)](LICENSE)
[![CodeQL](https://github.com/thisjulio/cagent/actions/workflows/github-code-scanning/codeql/badge.svg)](https://github.com/thisjulio/cagent/security/code-scanning)

Terminal coding agent written in Bun/TypeScript. cagent combines a terminal UI, sessions, tools, and an extensible plugin architecture. Providers and tools are plugins, so the core stays small while integrations can evolve independently.

> **Status:** cagent is under active development. Plugin APIs and configuration formats may change before version 1.0.

## Contents

- [Quick start](#quick-start)
- [Installation](#installation)
- [Authentication](#authentication)
- [Configuration](#configuration)
- [Choosing a model](#choosing-a-model)
- [Using cagent](#using-cagent)
- [Included plugins](#included-plugins)
- [Development](#development)
- [Architecture](#architecture)
- [Security](#security)
- [Contributing](#contributing)

## Quick start

### 1. Install

Linux and macOS:

```bash
curl -fsSL https://raw.githubusercontent.com/thisjulio/cagent/main/install.sh | bash
```

The installer downloads the latest release binary, verifies its SHA-256 checksum, and installs `cagent` in `~/.local/bin`. Open a new terminal after installation, or update the current shell:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

### 2. Authenticate a provider

For the OpenAI provider, choose one of these methods:

**API key**

```bash
export OPENAI_API_KEY="your-api-key"
```

**Codex OAuth**

If `OPENAI_API_KEY` is not configured, the OpenAI provider can use the OAuth login flow used by Codex. Start cagent and follow the browser prompt when it appears:

```bash
cagent
```

Do not commit API keys, OAuth tokens, or configuration files containing credentials. Prefer your shell's secret-management facilities or environment variables.

### 3. Start a session

```bash
cagent
```

Then describe the task in the terminal. The default model is configured with a `provider/model` route, for example `openai/gpt-4o-mini`.

If the command is not found immediately after installation, run the binary directly:

```bash
"$HOME/.local/bin/cagent"
```

## Installation

### Install the latest release

The installer supports Linux and macOS, including musl-based Linux distributions
such as Alpine. To install a specific version:

```bash
curl -fsSL https://raw.githubusercontent.com/thisjulio/cagent/main/install.sh | bash -s -- --version 0.1.4
```

To update an existing installation:

```bash
cagent upgrade
```

If the current version is already the latest, cagent reports that no upgrade is available. If you installed into a protected directory such as `/usr/local/bin`, use the same permissions required during installation.

### Build from source

Requires [Bun](https://bun.sh/):

```bash
git clone https://github.com/thisjulio/cagent.git
cd cagent
bun install
bun start
```

## Authentication

Authentication belongs to the provider plugin. The core does not require one universal credential mechanism; each provider documents and implements its own authentication options.

### OpenAI provider

The OpenAI provider supports:

1. **API-key authentication** through `OPENAI_API_KEY`.
2. **Codex OAuth authentication** when an API key is not configured.

The provider resolves authentication when it prepares a request. Existing OAuth credentials may be refreshed; if they are unavailable or cannot be refreshed, cagent starts a new login flow. The browser-based flow may require you to complete the provider's sign-in and consent steps.

Use an API key when you need a non-interactive setup, such as CI or a managed development machine. Use OAuth when you want the Codex account login experience. Never put either credential in a checked-in file.

### Troubleshooting authentication

- **The browser does not open:** copy the URL printed by cagent into a browser on the same machine, then return to the terminal.
- **OAuth keeps asking you to sign in:** remove stale provider credentials using the provider's credential-management mechanism, restart cagent, and complete the login again.
- **The API key is ignored:** verify it is exported in the same shell that launches cagent and that the configured route starts with `openai/`.
- **Requests fail after login:** confirm the selected model is available to the authenticated account and check the provider error printed by cagent.
- **Automation or CI:** use `OPENAI_API_KEY`; do not depend on an interactive OAuth browser flow.

Other providers may use different environment variables or configuration fields. See the provider plugin documentation before adding credentials to `cagent.yml`.

## Configuration

cagent reads configuration from:

- `~/.cagent/config.yml` — global defaults.
- `cagent.yml` — project configuration; project values take precedence.
- Environment variables — provider credentials and other runtime secrets.

A minimal OpenAI configuration is:

```bash
mkdir -p ~/.cagent
cat > ~/.cagent/config.yml <<'YAML'
model: openai/gpt-4o-mini
YAML
```

Model routes always use the `provider/model` format. For example:

```yaml
model: openai/gpt-4o-mini
```

Keep configuration files free of credentials whenever possible. Use environment variables for secrets and add local configuration files to your global Git exclude file if they must remain untracked.

cagent also loads the Codex-compatible `AGENTS.md` hierarchy and Markdown rules below `.cagent/rules/` or Claude-compatible `.claude/rules/`. Claude rule files may use YAML frontmatter to scope them to paths:

```markdown
---
paths: ["src/**/*.ts"]
---
Keep TypeScript changes covered by tests.
```

`AGENTS.md` wins over `CLAUDE.md` in the same directory.

## Choosing a model

A model route identifies both the provider and model: `$provider/$model`. Select a model exposed by an enabled provider, then put that route in `~/.cagent/config.yml` or the project `cagent.yml`.

The included providers are:

- `openai` — OpenAI and Codex-compatible access.
- `llama.cpp` — provider compatible with `llama-server`.

Provider availability, model names, context limits, and authentication requirements depend on the provider and your account.

## Using cagent

cagent can read and search a workspace, edit files, run approved commands, and maintain sessions. Review tool requests before allowing commands that modify files or access external systems.

Useful commands during development:

```bash
bun test
bun run build:release
cagent upgrade
```

The terminal status bar shows the selected model route and context usage. Use `/help` inside a session to discover available commands.

## Interactive TUI

Run `cagent --interactive` to start a terminal session without submitting a prompt. Slash commands are available from the input:

| Command | Description |
| --- | --- |
| `/help [topic]` | Browse command/key help or inspect a topic. |
| `/model`, `/sessions` | Select a model or resume a session. |
| `/new`, `/rename`, `/compact` | Manage the current conversation. |
| `/skill <name>`, `/reload-skills` | Invoke or reload skills. |
| `/usage`, `/telemetry`, `/lsp` | Inspect token usage, local telemetry, or language-server status. |
| `/tasks`, `/preference`, `/variant`, `/init` | Manage tasks, preferences, model variant, or project instructions. |

Keyboard shortcuts: `Esc` closes a panel, clears idle input, or interrupts a running turn; `Ctrl+C` clears input, cancels a turn, or exits with status 130; `Ctrl+M` cycles ask/auto/read-only permissions; `Ctrl+O` opens tool output and `Shift+Ctrl+O` moves to the previous tool call; `Tab` completes commands. Edit input with `Ctrl+U`, `Ctrl+W`, `Ctrl+A`, `Ctrl+E`, `Ctrl+Left/Right`, or `Home`/`End`.

## Included plugins

- `openai`: OpenAI and Codex provider.
- `llama.cpp`: provider compatible with `llama-server`.
- `bash`: workspace command execution.
- `code-tools`: reading, searching, editing, and AST structural search.

`search_ast` uses `@ast-grep/napi` in-process, without running `bun x` or an external CLI. Supported languages are JavaScript, TypeScript, TSX, HTML, and CSS.

## Architecture

```text
Terminal UI -> Controller -> core (loop, sessions, registry) -> SDK
                                      ^
                                      |
                                  plugins
```

The core coordinates conversations, sessions, tools, and the terminal UI. Plugins provide model providers, tools, and integrations. See [`CONTEXT.md`](CONTEXT.md) for the project glossary and [`docs/adr/`](docs/adr/) for architectural decisions.

## Security

Treat prompts, tool output, workspace files, API keys, and OAuth tokens as sensitive. Do not paste credentials into prompts, commit them to Git, or include them in issue reports.

Report security vulnerabilities privately as described in [`SECURITY.md`](SECURITY.md). Do not disclose exploitable details in a public issue.

## Contributing

Contributions are welcome. Please read [`CONTRIBUTING.md`](CONTRIBUTING.md) before opening an issue or pull request. Changes should include tests where applicable and follow the architecture and module limits documented in [`AGENTS.md`](AGENTS.md).

## Release

A `v*` tag triggers the release workflow. CI builds executables for Linux and macOS on `x64` and `arm64`, then publishes the four binaries and `SHA256SUMS`.

```bash
git tag v0.1.0
git push origin v0.1.0
```

## License

MIT. See [`LICENSE`](LICENSE).
