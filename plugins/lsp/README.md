# LSP plugin

The LSP plugin provides a minimal JSON-RPC client for language servers running
over standard input and output. It supports TypeScript/JavaScript, Python, and
Rust by default.

Install the language servers separately:

- TypeScript/JavaScript: `typescript-language-server --stdio`
- Python: `pyright-langserver --stdio`
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
are one-based.

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