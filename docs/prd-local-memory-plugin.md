# PRD: Local Memory Plugin

## 1. Summary

The Local Memory Plugin gives cagent persistent, semantic context across sessions while remaining fully offline at runtime and optional. It owns the complete memory workflow: entries, scopes, storage, embedding runtime, local model, index, retrieval policy, capture policy, approval flow, commands, diagnostics, and prompt contribution.

The first release validates explicit product value while also providing conservative automatic capture and automatic retrieval. Capture and retrieval are independent controls. Automatic capture creates untrusted suggestions; automatic retrieval uses only approved, eligible entries.

The Core does not gain a memory concept. It continues to own message handling, prompt assembly, canonical session history, the agent loop, and the terminal UI. The SDK evolves only through generic workflow extension mechanisms required by any plugin, as defined by ADR-0008 and ADR-0009.

## Product architecture

```text
┌──────────────┐    generic SDK extensions    ┌─────────────────────────┐
│     Core     │◄────────────────────────────►│   Local Memory Plugin   │
│              │                              │                         │
│ messages     │                              │ memory concepts         │
│ prompts      │                              │ capture and approval    │
│ history      │                              │ local storage and index │
│ agent loop   │                              │ CPU embeddings / model  │
└──────┬───────┘                              │ retrieval and commands  │
       │                                      └───────────┬─────────────┘
       │ provider request                                │
       ▼                                                 ▼
┌──────────────┐                              ┌─────────────────────────┐
│   Provider   │                              │   Plugin-owned data    │
│   plugin     │                              │ project / user / session│
└──────────────┘                              └─────────────────────────┘
```

The Core coordinates the message workflow but does not know that the plugin implements memory. The plugin uses generic SDK events, context extension, commands, storage, configuration, and diagnostics to add its behavior.

## 2. Problem

Each cagent session must rediscover project conventions, architectural decisions, known failures, and user preferences. Existing project files and session history provide some context, but they do not provide a controlled, semantic, cross-session knowledge layer.

A memory feature implemented in the Core or represented as a memory-specific SDK contract would violate the plugin architecture. It would also make the product dependent on a particular storage model, embedding technology, or retrieval policy.

## 3. Goals

- Provide useful project and user context across sessions.
- Work fully offline after installation and never use a runtime network fallback.
- Run embeddings locally on CPU.
- Use a small multilingual baseline for Portuguese and English.
- Let the plugin own all memory concepts and policies.
- Capture useful candidates automatically without silently trusting them.
- Add relevant approved context automatically before provider calls when enabled.
- Keep canonical session history owned by the Core.
- Make persistent memory explicit, inspectable, editable, and removable.
- Make capture and retrieval independently configurable.
- Fail open: memory failures must not block normal cagent use.
- Preserve provider independence and plugin replaceability.

## 4. Non-goals

- Building a general-purpose knowledge graph.
- Replacing `AGENTS.md`, ADRs, rules, skills, or canonical session history.
- Synchronizing memories between machines or users.
- Sending memory content or embeddings to a remote service.
- Defining `Memory`, `MemoryProvider`, or embedding contracts in the SDK.
- Allowing the plugin to silently rewrite canonical history.
- Automatically approving captured candidates.
- Treating retrieved content as system instructions.
- Provider/LLM-based candidate extraction in the first release.
- GPU-optimized embedding in the first release.
- Automatic expiration, reranking, `sqlite-vec`, or LanceDB in the first release.

## 5. Product principles

### 5.1 Plugin-owned domain

The plugin defines what an entry is, how it is represented, and how it is used. The Core and SDK expose only generic mechanisms.

### 5.2 Local-first and offline

The default implementation uses `intfloat/multilingual-e5-small` through a CPU-compatible JavaScript ONNX runtime such as Transformers.js. Model artifacts are prepared or distributed explicitly. Runtime never downloads a model or uses a remote fallback.

### 5.3 Explicit trust

Persistent entries have provenance, status, and confidence. User-created entries are approved by explicit action. Automatically captured entries start as `pending` and require approval. Retrieved plugin content is untrusted data, not system instructions.

### 5.4 Canonical sources win

Explicit project artifacts such as ADRs and `AGENTS.md` remain authoritative. Memory supplements them and must not silently override them. Suspected contradictions remain out of automatic retrieval until reviewed.

### 5.5 Bounded context

The plugin chooses relevant content, but the Core enforces global prompt and token limits, preserves system-level instructions, and controls final placement.

## 6. Target users and use cases

### Primary users

- Developers working repeatedly in the same repository.
- Users running cagent across multiple sessions.
- Users who need local privacy and offline operation.

### Initial use cases

1. Remember a project convention, such as the test command.
2. Remember an architectural decision discussed during a session.
3. Remember a failed approach and warn before repeating it.
4. Recall user preferences that are not project-specific.
5. Automatically suggest useful knowledge after a completed turn.
6. Automatically provide relevant approved knowledge when a new task begins.
7. Inspect, edit, approve, archive, and delete stored knowledge.

## 7. User experience

The plugin provides commands through the generic SDK command mechanism:

```text
/memory add <text>
/memory add --scope project --kind convention <text>
/memory list [--scope project|user] [--status pending|approved|ignored|archived]
/memory search <query>
/memory show <id>
/memory edit <id> <text>
/memory approve <id>
/memory ignore <id>
/memory archive <id>
/memory forget <id>
/memory pending
/memory status
/memory diagnostics
/memory retrieval on|off
```

`/memory add` is explicit approval and creates an approved entry by default. Its default scope is `project`; its default kind is `fact`. The user may supply structured flags for scope and kind. Automatically captured candidates always remain pending until explicitly approved.

When capture is enabled in `suggest` mode, the plugin may show at most two suggestions at the end of a turn and at most five per session:

```text
Possible project memory:
"This project runs tests with bun test."

[A] Approve  [E] Edit  [I] Ignore
```

Editing a suggestion keeps it pending; approval is a separate action. Ignored suggestions are not automatically shown again. Similar candidates are grouped rather than duplicated.

When retrieval is enabled for the project and eligible entries are found, the existing activity or diagnostics surface shows a compact notice:

```text
[local-memory: 2 entries added]
```

Detailed diagnostics expose IDs, scopes, scores, exclusions, conflicts, and timing without displaying detected secrets in clear text.

`/memory status` reports local operation details:

```text
Memory plugin: enabled
Capture: suggest
Retrieval: enabled (project override)
Embedding runtime: bundled local CPU
Model: intfloat/multilingual-e5-small
Index: SQLite hybrid search
Network: disabled
Project entries: 42
User entries: 8
Pending suggestions: 2
```

## 8. Memory workflow

### 8.1 Capture

The plugin observes completed turns and selected tool-completion events. It does not store complete tool output. Deterministic heuristics look for concise signals such as explicit project conventions, decisions, preferences, commands, and explanations of failed approaches. Candidate extraction does not call the provider.

Candidates are short, untrusted, and capped at two suggestions per turn and five per session. Similar candidates are grouped. Likely secrets and personal sensitive data are detected; suspicious content is masked in the suggestion and the original is not persisted before explicit confirmation.

### 8.2 Approval

Candidates are never automatically approved. Approval is available through the suggestion interaction or `/memory approve <id>`. `/memory edit` updates a candidate but leaves it pending. Non-interactive and CI runs retain candidates as pending and never approve them silently.

### 8.3 Storage

The plugin owns a namespaced SQLite database in the user data directory. Project entries are not Git-versioned in the first release. A logical archive removes an entry from retrieval while preserving it for inspection; `/memory forget` requires confirmation and physically removes content and its embedding.

### 8.4 Embedding

The baseline model is `intfloat/multilingual-e5-small`, with 384-dimensional embeddings. The runtime is loaded lazily on the first semantic operation. Each vector records model ID, revision, dimension, normalization method, and artifact hash. Model changes require explicit reindexing; incompatible vectors are never compared.

### 8.5 Retrieval

When enabled explicitly per project, automatic retrieval runs after canonical context assembly and before provider invocation, after a user message and not for repeated internal tool calls. It searches enabled `project` and `user` scopes, filters to approved, non-archived, non-expired, non-conflicting entries, applies a relevance threshold, deduplicates, and returns at most five entries within an initial configurable budget of 400–800 tokens.

Retrieval combines lexical matching (SQLite FTS5 or equivalent) with cosine similarity. Results are fused deterministically, preferably using Reciprocal Rank Fusion. If embeddings are unavailable, lexical search remains available and the failure appears in diagnostics.

### 8.6 Context contribution

The plugin returns bounded prompt material with provenance through the generic context-extension mechanism. The contribution is clearly delimited as untrusted data and cannot modify system instructions or canonical history. The Core applies the final global budget and may reject the contribution. Retrieved content is not promoted into session history or automatically preserved by compaction.

### 8.7 Maintenance

The plugin supports editing, archiving, deletion, duplicate detection, conflict review, stale-entry diagnostics, and explicit reindexing. Automatic expiration is deferred. A new entry that contradicts an approved entry creates an explicit conflict; conflicting entries remain preserved but are excluded from automatic retrieval until the user resolves the conflict.

## 9. Scope and data model owned by the plugin

The first release supports:

- `project`: knowledge associated with the current project;
- `user`: knowledge shared across projects.

`session` is deferred because canonical session history already belongs to the Core and a second session-level source would be ambiguous.

Initial entry kinds are `convention`, `decision`, `preference`, and `fact`. `failure` and `hypothesis` remain future kinds until their confidence policies are defined.

Each entry retains:

- stable identifier;
- short content, initially limited to approximately 500 tokens;
- scope and kind;
- status: `pending`, `approved`, `ignored`, `archived`;
- confidence;
- source session or command;
- project identity when applicable;
- creation and update timestamps;
- optional expiration or superseded reference;
- conflict state;
- embedding model identity and vector metadata;
- normalized-text and similarity signals for duplicate detection.

Project identity uses the Git root and remote when available, with a stable fallback for non-Git projects. Project data is always filtered by identity in the storage layer.

## 10. Core evolution required

The Core must not add memory-specific behavior. It must evolve only where generic extension support is currently insufficient:

1. Define stable lifecycle points around message submission, prompt/context assembly, tool completion, turn completion, session completion, and compaction.
2. Execute registered prompt/context extensions after canonical context assembly and before provider invocation.
3. Provide deterministic extension ordering and cancellation behavior.
4. Enforce global context and token budgets after plugin contributions.
5. Preserve system messages and canonical session history.
6. Isolate extension failures from the normal message workflow according to the existing plugin failure policy.
7. Expose diagnostics so users can see whether an extension contributed context or failed.
8. Ensure extensions cannot recursively trigger the same workflow without an explicit mechanism.
9. Exclude extension-contributed content from same-turn retrieval input and compacted canonical history.

The Core remains responsible for the final assembled request, not for understanding why a plugin contributed content.

## 11. SDK evolution required

The SDK already exposes generic events, prompt sections, command sources, hooks, configuration, and plugin registration. It should evolve these mechanisms into explicit, typed contracts without introducing memory-specific concepts.

### 11.1 Workflow events

Replace untyped event payloads with versioned generic event contracts for lifecycle points relevant to plugins:

```ts
session.started
message.submitted
prompt.assembling
prompt.assembled
tool.completed
turn.completed
session.compacted
session.completed
```

Events include stable session/project identifiers and readonly data where possible. Tool-completion payloads expose bounded/selected data rather than requiring plugins to persist complete output.

### 11.2 Context extension registry

Add a generic registration mechanism for plugins that need to contribute or transform context:

```ts
interface ContextExtension {
  id: string;
  phase: string;
  priority?: number;
  contribute(input: ContextExtensionInput): Promise<ContextContribution | void>;
}
```

The names and exact types are implementation decisions, but the contract remains domain-neutral. `ContextContribution` describes bounded prompt material and provenance; it does not describe memory. Ordering uses phase, priority, and deterministic ID tie-breaking.

### 11.3 Generic plugin storage

Expose namespaced storage paths or a storage factory so plugins can persist private state without importing Core filesystem internals. The SDK must not provide memory tables or vector-specific methods.

### 11.4 Commands

Allow plugins to register structured command handlers and subcommands, rather than only discovered static command content. Existing command discovery remains compatible.

### 11.5 Configuration and diagnostics

Provide plugin-scoped configuration and diagnostics access. Diagnostics support status, warnings, non-fatal failure reporting, timing, and safe redaction without requiring a plugin-specific UI.

### 11.6 Token and context metadata

Expose generic token estimates, context budgets, and source metadata needed by any context extension. Providers remain responsible for model-specific token estimation where applicable.

## 12. Proposed plugin package

```text
plugins/memory-local/
  package.json
  assets/model/
  src/
    index.ts
    plugin.ts
    workflow.ts
    capture.ts
    retrieval.ts
    context-extension.ts
    storage.ts
    embedding-runtime.ts
    model-loader.ts
    commands.ts
```

The plugin may depend on `@huggingface/transformers` or another CPU-compatible local runtime. The dependency and model distribution strategy remain internal to the plugin package.

## 13. Configuration

Example project configuration:

```yaml
plugins:
  memory-local:
    enabled: true
    capture: suggest
    retrieval: false
    scopes:
      - project
      - user
    retrieval_options:
      top_k: 5
      min_score: 0.65
      max_tokens: 600
    entry_max_tokens: 500
```

`capture` and `retrieval` are independent. Retrieval is disabled by default and must be enabled explicitly per project. `/memory retrieval on|off` provides a temporary session override. The exact schema belongs to the plugin; the Core only enables it and passes plugin-scoped configuration.

## 14. Acceptance criteria

### Functional

- A user can add, list, search, inspect, edit, archive, approve, ignore, and forget plugin-owned entries.
- Explicit manual entries are approved; automatic candidates remain pending until approval.
- Approved project and user entries can be retrieved in a later session when retrieval is enabled.
- Retrieval uses a local embedding model when available and lexical fallback when it is not.
- Hybrid retrieval handles exact commands/paths and semantic paraphrases.
- The plugin observes completed turns and selected tool completions and creates bounded candidates.
- Capture and retrieval can be disabled independently.
- Canonical session history remains unchanged by the plugin.
- Retrieved context is delimited, bounded, and marked as untrusted.

### Privacy and reliability

- Runtime memory operations make no network requests and do not download artifacts.
- No automatic remote fallback exists.
- Possible secrets are masked and require explicit confirmation; originals are not persisted before confirmation.
- Plugin failure does not prevent the user from continuing the session.
- Stored entries identify scope, status, confidence, and provenance.
- Project entries cannot leak across project identities.
- Retrieved content cannot replace system-level instructions.
- Forget removes stored text and embedding after confirmation.

### Quality and performance

- A recorded Portuguese/English corpus contains at least 50 memories and 25 queries.
- Recall@5, MRR, capture precision, false-positive rate, secret-detection cases, and manual false-positive review are recorded.
- CPU embedding, lazy-load, startup, memory, and retrieval timings are benchmarked.
- Initial limits are informative until representative hardware is measured.

### Architecture

- No memory-specific type or branch is added to the Core.
- No memory-specific type is added to the SDK.
- The plugin uses generic SDK events, context extension, command, storage, and diagnostics mechanisms.
- The implementation remains within repository module and file-size limits.
- Vectors from incompatible models are never compared without reindexing.

## 15. Delivery phases

### Phase 1: Explicit and automatic local memory

- Plugin registration and generic workflow contracts.
- Explicit add/list/search/show/edit/approve/archive/ignore/forget/status/diagnostics commands.
- Bundled or explicitly installed CPU embedding runtime/model.
- Namespaced SQLite storage and migrations.
- Linear cosine search plus lexical search and deterministic hybrid fusion.
- Approved project and user scopes.
- Automatic capture in conservative `suggest` mode from completed turns and selected tool results.
- Automatic retrieval enabled explicitly per project and disabled by default.
- Bounded, delimited, untrusted context contribution.

### Phase 2: Workflow quality

- Improved capture heuristics and corpus-driven tuning.
- Interactive approval/editing flow across supported UI modes.
- Better context diagnostics and token budget handling.
- Explicit conflict review and approximate duplicate suggestions.
- Session overrides and maintenance UX hardening.

### Phase 3: Reliability and scale

- Hybrid ranking refinement and optional reranking.
- `failure` memories and richer provenance.
- Expiration and stale-entry review.
- Reindexing and model migration UX.
- `sqlite-vec` or LanceDB backend if measured scale requires it.
- Compaction-aware diagnostics and performance improvements.

## 16. Decisions resolved by product review

1. The first model baseline is `intfloat/multilingual-e5-small`; `bge-m3` is deferred.
2. Runtime uses a local JavaScript ONNX-compatible implementation; no network fallback is allowed.
3. Model artifacts are explicitly distributed/prepared and validated by metadata and hash.
4. Project memory is private user data, not Git-versioned in the first release.
5. Retrieval is hybrid lexical plus vector, starting with SQLite and linear vector search.
6. Retrieval is automatic but disabled by default and activated per project.
7. Capture is automatic when enabled, in `suggest` mode; candidates always require approval.
8. Memory content is untrusted data and never system instruction.
9. Conflicts block automatic retrieval until user review.
10. The Core/SDK expose only generic extension mechanisms.

## 17. Remaining implementation questions

1. Which exact generic SDK contract should be adopted for context extensions after inspecting the current prompt mechanism?
2. Which Transformers.js and Bun versions pass the compatibility benchmark?
3. Which exact model artifact revision and license terms will be shipped?
4. What stable non-Git project identity fallback best handles copied directories?
5. Which existing interaction mechanism supports approval in every supported UI and CI mode?
6. What measured corpus threshold should justify replacing linear search with `sqlite-vec` or LanceDB?
