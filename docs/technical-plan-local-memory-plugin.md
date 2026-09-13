# Technical plan: Local Memory Plugin

## Status

Planning only. No implementation starts from this document.

## Outcome

Deliver an optional local memory plugin that captures short candidates from completed workflows, lets the user approve and maintain them, and contributes relevant approved context before provider calls when retrieval is enabled for the project.

## Constraints

- Do not add a memory concept to Core or SDK.
- Use generic workflow events, context extensions, commands, namespaced storage, configuration, and diagnostics.
- Keep canonical session history unchanged.
- Keep retrieved content outside system instructions and mark it as untrusted data.
- Runtime must not access the network or silently download a model.
- Every plugin failure must fail open.
- Keep every source file below repository module limits.

## Technical architecture

```text
User message
    │
    ▼
┌───────────────┐   lifecycle events   ┌──────────────────────────────┐
│ Core workflow │─────────────────────►│ Local Memory Plugin           │
│               │                      │                              │
│ history       │◄──context extension──│ capture → approve → store    │
│ prompt build  │                      │ embed → index → retrieve     │
│ token budget  │                      │ commands → maintenance       │
│ provider call │                      └──────────────┬───────────────┘
└───────┬───────┘                                     │
        │ final prompt                                 │ owns
        ▼                                              ▼
┌───────────────┐                         ┌──────────────────────────────┐
│ Provider       │                         │ Local plugin data             │
│ plugin         │                         │ SQLite + FTS + vectors       │
└───────────────┘                         │ bundled ONNX model / runtime │
                                         └──────────────────────────────┘
```

The plugin owns the complete memory workflow and decides what context to contribute. The Core only provides generic extension points, assembles the final prompt, enforces global budgets, preserves system instructions and canonical history, and keeps extension failure non-fatal.

## Work packages

### WP1 — Generic SDK/Core contracts

Specify and test versioned lifecycle event payloads, context-extension registration, deterministic phase/priority ordering, cancellation, global token budgets, structured plugin commands, namespaced storage, and non-fatal diagnostics. Confirm the minimum changes against ADR-0008 before implementation.

Exit evidence: contract tests demonstrate ordering, budget enforcement, system-message preservation, cancellation, recursion prevention, and isolated extension failure.

### WP2 — Plugin identity and configuration

Define plugin-scoped configuration with independent `capture` and `retrieval` switches, project-level retrieval activation, scopes, top-k, relevance threshold, token budget, and temporary session override. Define project identity from Git root/remote with a non-Git fallback.

Exit evidence: configuration tests cover defaults, project overrides, session overrides, and disabled-plugin behavior.

### WP3 — Storage and domain model

Implement a namespaced SQLite store owned by the plugin. Define migrations and records for content, scope, kind, status, confidence, provenance, project identity, timestamps, conflict/supersession state, expiration metadata, embedding metadata, and vector data. Separate logical archive from destructive forget.

Exit evidence: persistence, migration, project isolation, user-scope filtering, archive, forget, and backup/recovery tests pass.

### WP4 — Local embedding runtime

Package and validate the chosen `intfloat/multilingual-e5-small` ONNX artifact and JavaScript runtime. Load lazily on the first semantic operation. Validate artifact hash and model metadata. Provide explicit preparation and reindexing commands; never download at runtime.

Exit evidence: offline runtime test, missing-model fallback, deterministic metadata, CPU benchmark, and model-change reindex tests.

### WP5 — Hybrid retrieval

Implement lexical retrieval with SQLite FTS5 or equivalent, cosine similarity over stored vectors, scope/status/conflict filters, exact and approximate duplicate signals, deterministic RRF fusion, thresholding, deduplication, and bounded top-k/token output. Exclude extension contributions from same-turn queries.

Exit evidence: Portuguese/English evaluation corpus reports Recall@5 and MRR, with manual false-positive review and benchmark results.

### WP6 — Commands and maintenance

Register `/memory add`, `list`, `search`, `show`, `edit`, `approve`, `archive`, `forget`, `status`, `diagnostics`, and pending/temporary retrieval controls through generic command registration. Support structured flags and short-form add. Enforce the approximate 500-token entry limit and secret warnings/confirmation.

Exit evidence: command integration tests cover interactive and non-interactive behavior, permissions, validation, and safe output.

### WP7 — Automatic capture

Observe completed turns and selected tool completions. Extract short candidates with deterministic heuristics, cap suggestions at two per turn and five per session, group similar candidates, mark possible secrets, and persist only as pending. Provide approve, edit-then-approve, ignore, and review flows.

Exit evidence: fixed positive/negative corpus reports capture precision, false-positive rate, duplicate handling, contradiction handling, and no secret persistence before confirmation.

### WP8 — Automatic context contribution

Register a generic context extension that runs after canonical context assembly and before provider invocation. Retrieve only approved eligible records when project retrieval is enabled, apply score/token limits, delimit content as untrusted, emit compact activity diagnostics, and preserve system messages/history. Do not retrieve during internal tool calls or compact retrieved material into canonical history.

Exit evidence: integration tests prove correct placement, budget enforcement, no system override, no same-turn loop, opt-out behavior, and failure-open behavior.

### WP9 — Release hardening

Document supported platforms, model artifact installation, offline guarantees, data locations, privacy behavior, backup/forget semantics, and migration/reindex operations. Run full tests, architecture checks, package-size/startup/CPU benchmarks, and graph update.

Exit evidence: release checklist passes without implementing unapproved scope such as reranking, automatic expiration, sqlite-vec, LanceDB, or provider-based extraction.

## Execution order

WP1 → WP2 → WP3 → WP4 → WP5 → WP6 → WP7 → WP8 → WP9.

WP4 may be prototyped independently for compatibility measurement, but no product implementation is approved until WP1 contracts are settled.

## Explicitly deferred

- `bge-m3` as default;
- reranker models;
- `sqlite-vec` and LanceDB backends;
- automatic expiration;
- provider/LLM-based candidate extraction;
- Git-versioned project memory;
- automatic approval;
- memory-specific SDK types;
- implementation work before this plan is reviewed.
