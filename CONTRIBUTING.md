# Contributing to cagent

Thank you for helping improve cagent. Contributions may include bug fixes,
documentation, tests, plugins, and architectural proposals.

## Before you start

1. Search existing issues and pull requests.
2. For a significant change, open an issue first to discuss the approach.
3. Read [`CONTEXT.md`](CONTEXT.md) and the architecture decisions in
   [`docs/adr/`](docs/adr/).

## Development

Install Bun, then run:

```bash
bun install
bun test
bun run typecheck
bun run lint
```

Keep changes focused, add tests for behavior changes, and update
documentation when user-facing behavior changes. Follow the existing
architecture and keep repository artifacts in English.

## Pull requests

Describe the problem, the solution, and how you verified it. Link related
issues and call out breaking changes or follow-up work. Pull requests should
pass CI and be ready for review before requesting approval.

By contributing, you agree that your contribution is provided under the
project's [MIT License](LICENSE).