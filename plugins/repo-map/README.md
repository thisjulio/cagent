# Repository map plugin

Optional structural context for TypeScript and JavaScript repositories. The plugin extracts declarations and references with ast-grep, builds a weighted file graph, and renders PageRank-ranked declarations through the stable context extension API (ADR-0013). It does not use an LSP or change canonical history.

## Enable

Add this entry to the `plugins` list in your cagent configuration:

```yaml
- name: repo-map
  path: ./plugins/repo-map/src/index.ts
  config:
    tokens: 1000
```

The source path above is for a repository checkout. Installed packages can use `name: "@cagent/plugin-repo-map"` without a path. The release build discovers this plugin automatically, but it still needs a configuration entry to enable it.

`root` optionally selects a directory instead of the working directory. Git is not required. `tokens` defaults to 1000 and is capped at 2000; zero disables the contribution. The actual contribution also respects the shared context-extension budget, estimating one token per four characters.

## Lifecycle and cache

Plugin initialization awaits index preparation before registering the extension. This prevents a cold, empty result from being cached for the whole session, but cold indexing adds startup latency. The extension itself only renders the prepared index. Starting or restoring a session freezes its contribution according to the core stable-prefix rules. Source edits do not refresh an existing contribution; restarting the application rebuilds the index.

The plugin stores a versioned incremental cache under its namespaced storage directory, keyed by canonical root, file path, modification time and size. Changed files are parsed again and deleted files disappear on the next build. Cache read/write failures do not prevent an in-memory map.

## Scope and limits

- Supports `.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs`, and `.cjs`.
- Walks directories directly without spawning Git. Uses `ignore` to interpret root and nested `.gitignore` files with directory-relative scope, negations and child-rule precedence. Excluded directories are not traversed. Matching is case-sensitive; Git global excludes and `.git/info/exclude` are not loaded.
- Operational exclusions still skip hidden entries, `node_modules`, `vendor`, `dist`, `build`, `coverage`, `target`, `graphify-out`, and the plugin cache directory, regardless of negations. Symlinked `.gitignore` files and ignore files larger than 256 KB are not read.
- Visits at most 20,000 directory entries and reads at most 2000 supported files, 256 KB per file, and 20 MB total. Selected files are sorted by path. Large repositories therefore receive a partial map.
- Skips symbolic links and paths resolving outside the selected root.
- Resolves relative imports, including common JavaScript-to-TypeScript extensions and directory indexes. Package imports and TypeScript path aliases are not resolved.
- References use syntactic name matching, preferring imported files. Ambiguous names without a direct import are omitted; this is not compiler-level symbol resolution.
- IDF-like weights reduce the influence of common names. Thirty PageRank iterations produce deterministic file ordering.
- Emits at most eight selected declarations per file, with signatures capped at 300 characters. Type aliases show their names rather than complete potentially large definitions.
- Contributions are marked untrusted. The map is navigation context, not instructions or a substitute for reading source before editing.

Run checks with `bun test plugins/repo-map/test`.
