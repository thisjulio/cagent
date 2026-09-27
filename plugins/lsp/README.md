# LSP plugin

The LSP plugin provides a minimal JSON-RPC client for language servers running
over standard input and output. It supports TypeScript/JavaScript, Biome,
Python, and Rust by default.

TypeScript/JavaScript, Biome, and Python servers ship with the plugin as
dependencies (`typescript-language-server`, `@biomejs/biome`, and `pyright`)
and are resolved to absolute paths automatically. Rust requires a separate
install:

- Rust: `rust-analyzer`

Enable the plugin in `cagent.yml`:

```yaml
plugins:
  - name: "@cagent/plugin-lsp"
    path: "./plugins/lsp"
    config:
      lsp: true
```

The agent can call the `lsp` tool with `diagnostics`, `hover`, `definition`,
`references`, or `documentSymbol`. Lines and characters supplied to the tool
are one-based. Diagnostics fan out to every matching server, so `.ts` files
report `typescript+biome` findings tagged with `[server]`; other operations
prefer `typescript` when several servers match.

Every request has an 8s timeout and impact analysis is capped at 6s as
best-effort, so a slow server degrades to partial diagnostics instead of
hanging the edit hook.

Servers can be disabled or replaced:

```yaml
config:
  lsp:
    python: false
    typescript:
      command: ["typescript-language-server", "--stdio"]
      extensions: [".ts", ".tsx", ".js", ".jsx"]
```

The plugin synchronizes files after `write_file` and `edit_file` through the
existing code-tools events. It currently sends full document changes, which is
deliberately simple and compatible with servers supporting full synchronization.