# Local memory plugin product direction

## Status

Accepted

## Context

cagent needs optional cross-session context without adding a memory domain to the core or SDK. The product must remain local-first, provider-independent, inspectable, and safe when memory data is incomplete, stale, conflicting, or unavailable.

The agreed product direction includes automatic candidate capture and automatic retrieval, but these workflows must remain independently controllable. Automatic capture must not silently create trusted knowledge, and retrieved content must not gain system-instruction authority.

## Decision

The first local memory plugin will validate explicit usefulness while providing automatic workflows in conservative modes.

- The plugin owns entries, scopes, kinds, status, confidence, provenance, storage, embeddings, indexing, ranking, capture, approval, commands, and context contribution.
- The initial embedding baseline is `intfloat/multilingual-e5-small`, executed locally through a JavaScript ONNX-compatible runtime such as Transformers.js. Runtime operation has no network fallback.
- Model artifacts are versioned and distributed separately from the JavaScript package when practical. Each vector records model identity, revision, dimension, normalization, and artifact hash.
- Initial persistence uses plugin-namespaced SQLite. Vector search starts as linear cosine similarity; lexical search uses SQLite FTS5 or an equivalent local implementation. Results are fused with deterministic hybrid ranking, preferably RRF.
- Initial durable scopes are `project` and `user`. Project identity uses the Git root and remote when available, with a stable fallback for non-Git projects. Project data remains in the user data directory.
- Manual entries may be approved by the explicit user action. Automatically captured entries always start as `pending` and require approval. Capture defaults to `suggest` when enabled.
- Automatic retrieval is independently configurable, disabled by default, and explicitly enabled per project. Only approved, enabled, non-expired, non-archived, non-conflicting entries above a relevance threshold may contribute.
- Retrieval occurs after canonical context assembly and before provider invocation through generic SDK extensions. Contributions are bounded, visibly delimited as untrusted data, and cannot modify system instructions or canonical history.
- Capture observes completed turns and selected tool results, extracts short candidates with deterministic heuristics, limits suggestions, detects likely secrets, and never stores complete tool output automatically.
- Disabling the plugin or either workflow preserves data. Forgetting is explicit and destructive; archiving is logical. Model changes require explicit reindexing.
- Every failure is non-fatal to normal cagent operation. Semantic-search failures fall back to lexical search and diagnostics.

Core and SDK changes, if required, must remain generic and follow ADR-0008. No memory-specific type, branch, or storage method is added to the platform contracts.

## Consequences

- The first release can test real product value without adopting a dedicated vector database.
- Portuguese and English use cases are covered by a small multilingual baseline, at the cost of lower quality than larger models.
- Hybrid retrieval protects exact developer terms while supporting paraphrase search.
- Automatic capture increases utility but also creates false-positive and secret-leakage risks; approval and evaluation are mandatory.
- Automatic retrieval can add stale or adversarial text, so trust boundaries, conflict handling, budgets, and diagnostics are release requirements.
- SQLite linear search may need replacement by `sqlite-vec` or LanceDB if measured scale requires it.
- Model distribution and Bun compatibility remain release-engineering concerns rather than Core responsibilities.
