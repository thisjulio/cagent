# Code index plugin

The code index plugin provides local syntax-based symbol lookup and a bounded
repository map. Release builds include it as a built-in plugin alongside the
other bundled plugins. It does not require a language server.

For a custom plugin list, enable it in `cagent.yml`:

```yaml
plugins:
  - name: code-index
    config:
      repo_map_tokens: 1500
```

The first repository map is built lazily when context is requested. Per-file
symbol tags are stored in the plugin's namespaced storage directory and keyed
by a SHA-256 source hash and an index format version. Supported files are
parsed with Tree-sitter WASM. Each tag includes a short, language-specific
kind and a list of syntactic enclosing names. For example, a Rust method in
`impl Buffer` has `scope: ["Buffer"]`. The repository map and outline display
qualified names derived from that list, but remain flat, bounded lists rather
than a tree. Scope is syntactic, not semantic resolution: imports and types are
not resolved, and the grammar queries can omit declarations.

TypeScript, TSX, and JavaScript module variable tags exclude block/function
locals by default. Parameters are not indexed. Kinds are stable short labels
within this plugin, not a promise of exact Universal Ctags kind compatibility.

Tools:

- `outline(path)` lists definitions and signatures in one file.
- `read_symbol(path, name)` returns a symbol's source lines with line metadata.
  It is not an edit authorization: call `read_file` immediately before editing.
- `find_refs(name)` finds exact identifier spellings. It is approximate text
  search, not semantic reference analysis; use `lsp references` when accuracy
  matters.

The repository map contains syntax-derived information and may be incomplete.
The repository map is contributed on each turn, bounded by the context
extension budget, and refreshed when workspace files change. Changed files are
reparsed on write/edit events.

Validation campaign (2026-09-24): the parser was run over shallow public clones
of `sindresorhus/p-limit` (`a8a6fbe`), `pallets/flask` (`d73fa1c`),
`BurntSushi/ripgrep` (`3fce3b5`), `gin-gonic/gin`, `google/guava`, and
`nlohmann/json`. Across all six repositories, 4,150 supported files were parsed
and 73,500 tags were emitted with 0 runtime errors. The corpus exercised 12
grammar families. Zero-tag files may lack supported declarations or use
constructs not yet captured. These figures predate the scope and local-variable
changes; they are a parsing smoke test, not a current precision or recall audit.

Benchmark the corpus (including this repository as `cagent`) with
`CODE_INDEX_WORKERS=8 bun scripts/code-index-benchmark.ts`; set
`CODE_INDEX_CORPUS` to override the default `/tmp/code-index-campaign` clone
location, or pass repository names to select a subset. The benchmark uses
separate Bun processes for file shards, capped at eight workers, and runs
Universal Ctags concurrently. It compares exact file, line, and declared name
among named code kinds; anonymous generated tags, JSON keys, CSS selectors,
and qualified duplicate tags are excluded. `moduleRecall` additionally
excludes Ctags symbols whose immediate JS/TS scope is a function, method, or
generator. This is only an approximation of module scope (nested scope can
escape that filter), not a precision measurement. Do not compare these
percentages to earlier unfiltered Ctags campaign figures.

Tree-sitter is retained for the syntax index: it provides the polyglot,
embeddable parser substrate needed by this plugin, while per-language queries
remain the main maintenance cost. The existing `@ast-grep/napi` integration is
useful for structural search but currently supports a narrower language set in
this repository (JavaScript, TypeScript, TSX, HTML, and CSS) and is a native
addon, so it is not a drop-in replacement. Semantic navigation is a different
problem; use configured language servers through the LSP plugin, or a dedicated
indexer such as SCIP where available. The parser runtime and supported
grammars are bundled into the release executable. Markdown and YAML are not
indexed because the available WASM packages do not provide compatible support
in this plugin.

The fixture suite currently checks 35 expected names across all 13 advertised
grammars and has observed 35/35 recall on those fixtures. This is targeted
coverage, not a guarantee for arbitrary syntax or incomplete source files.