# cagent

[![CI](https://github.com/thisjulio/cagent/actions/workflows/ci.yml/badge.svg)](https://github.com/thisjulio/cagent/actions/workflows/ci.yml)
[![Release](https://github.com/thisjulio/cagent/actions/workflows/release.yml/badge.svg)](https://github.com/thisjulio/cagent/actions/workflows/release.yml)
[![GitHub release](https://img.shields.io/github/v/release/thisjulio/cagent)](https://github.com/thisjulio/cagent/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/thisjulio/cagent/total)](https://github.com/thisjulio/cagent/releases)
[![License: MIT](https://img.shields.io/github/license/thisjulio/cagent)](LICENSE)
[![CodeQL](https://github.com/thisjulio/cagent/actions/workflows/github-code-scanning/codeql/badge.svg)](https://github.com/thisjulio/cagent/security/code-scanning)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/thisjulio/cagent/badge)](https://securityscorecards.dev/viewer/?uri=github.com/thisjulio/cagent)

Terminal coding agent written in Bun/TypeScript. The core coordinates
conversations, sessions, tools, and the UI; providers and tools are plugins.

## Installation

Linux e macOS:

```bash
curl -fsSL https://raw.githubusercontent.com/thisjulio/cagent/main/install.sh | bash
```

The installer detects the architecture, downloads the latest release binary,
verifies its SHA-256 checksum, and installs `cagent` in `~/.local/bin`. Open a
new terminal after installation, or run:

```bash
export PATH="$HOME/.local/bin:$PATH"
cagent
```

To install a specific version:

```bash
  curl -fsSL https://raw.githubusercontent.com/thisjulio/cagent/main/install.sh | bash -s -- --version 0.1.4
```

After installation, update to the latest release with:

```bash
cagent upgrade
```

If the current version is already the latest, cagent reports that no upgrade is
available. Users who installed it in a protected directory such as
`/usr/local/bin` must run the command with the same permissions used during
installation.

## Configuration

cagent reads the global configuration from `~/.cagent/config.yml` and the
project configuration from `cagent.yml`. The project configuration takes
precedence.

### Scoped rules

cagent loads the Codex-compatible `AGENTS.md` hierarchy and Markdown rules
below `.cagent/rules/` or Claude-compatible `.claude/rules/`. Claude rule
files may use YAML frontmatter to scope them to paths:

```markdown
---
paths: ["src/**/*.ts"]
---
Keep TypeScript changes covered by tests.
```

`AGENTS.md` wins over `CLAUDE.md` in the same directory.

A minimal example using the OpenAI API:

```bash
export OPENAI_API_KEY="your-key"
mkdir -p ~/.cagent
cat > ~/.cagent/config.yml <<'YAML'
model: openai/gpt-4o-mini
YAML
```

Model routes always use the `provider/model` format. The OpenAI plugin also
supports the OAuth login used by Codex when no API key is configured.

## Development

Requires Bun:

```bash
git clone https://github.com/thisjulio/cagent.git
cd cagent
bun install
bun start
```

Useful commands:

```bash
bun test
bun run build:release
```

## Included Plugins

- `openai`: OpenAI and Codex provider.
- `llama.cpp`: provider compatible with `llama-server`.
- `bash`: workspace command execution.
- `code-tools`: reading, searching, editing, and AST structural search.

`search_ast` uses `@ast-grep/napi` in-process, without running `bun x` or an
external CLI. Supported languages are JavaScript, TypeScript, TSX, HTML, and
CSS.

## Architecture

```text
Terminal UI -> Controller -> core (loop, sessions, registry) -> SDK
                                      ^
                                      |
                                  plugins
```

See [`CONTEXT.md`](CONTEXT.md) and [`docs/adr/`](docs/adr/) for the glossary and
architectural decisions.

## Release

A `v*` tag triggers the release workflow. CI builds executables for Linux and
macOS on `x64` and `arm64`, then publishes the four binaries and `SHA256SUMS`.

```bash
git tag v0.1.0
git push origin v0.1.0
```

## Status

The project is under active development. Plugin APIs and configuration formats
may change before version 1.0.

## License

MIT. See [`LICENSE`](LICENSE).

## Contributing

Contributions are welcome. Please read [`CONTRIBUTING.md`](CONTRIBUTING.md)
before opening an issue or pull request.

## Security

Please report security vulnerabilities privately as described in
[`SECURITY.md`](SECURITY.md). Do not disclose exploitable details in a public
issue.
