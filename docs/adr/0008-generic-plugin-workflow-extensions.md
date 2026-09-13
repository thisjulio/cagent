# Generic plugin workflow extensions

## Status

Accepted

## Context

The core owns the cagent workflow: message handling, prompt and context management, session history, the agent loop, and the terminal UI. Plugins provide capabilities outside that workflow through the SDK.

A plugin may need to participate in more than tool or provider registration. For example, a plugin may add persistent project knowledge, transform a prompt, observe completed turns, register commands, or maintain a local index. Naming those capabilities in the core or SDK would make the platform depend on one plugin's domain model.

The extension mechanism must therefore support arbitrary plugin-defined capabilities without turning the core into a catalog of plugin-specific concepts.

## Decision

The core exposes generic workflow extension mechanisms through the SDK. Plugins define their own domain concepts and implement their complete workflows using those mechanisms.

The SDK may expose generic contracts for:

- subscribing to lifecycle and workflow events;
- registering commands and other user-facing entry points;
- contributing to or transforming prompt/context assembly;
- observing or participating in session-history lifecycle points;
- storing plugin-owned data through namespaced plugin storage;
- reading plugin configuration and reporting diagnostics.

These contracts must remain domain-neutral. The SDK must not define concepts that belong to a particular plugin, such as `Memory`, `MemoryProvider`, `EmbeddingProvider`, or `GraphProvider`, unless a later ADR establishes that concept as a core platform contract.

A plugin owns its complete capability workflow, including its data model, persistence, indexing, external or local runtime dependencies, retrieval or transformation policy, and user-facing commands. The core does not inspect or interpret plugin-owned state.

A plugin may contribute derived context to a model request through the generic context extension mechanism. The plugin decides what to select and how to represent it. The core remains responsible for assembling the final request, enforcing global context and token limits, preserving system-level instructions, and handling extension failure according to the existing plugin lifecycle policy.

The core continues to own canonical session history. Plugins may observe history lifecycle events and maintain derived or independent state, but they must not silently rewrite canonical history. Any history transformation point exposed by the SDK must be explicit, ordered, and subject to the core's global limits.

Plugins are optional and independently loadable. Absence, disablement, or failure of a plugin-specific capability must not require the core to understand or replace that capability. A plugin that needs a specialized workflow must add the required generic SDK extension point or propose a new ADR; it must not add plugin-specific branches to the core loop.

## Consequences

- New capabilities can be implemented as plugins without editing the core agent loop.
- The SDK remains a small platform contract rather than a registry of product concepts.
- Plugins can own local models, indexes, persistence, and policies without leaking those choices into the core.
- Prompt contributions are observable and bounded by core-wide assembly and token rules.
- Canonical session history remains consistent while plugins can maintain derived state.
- Generic extension contracts need careful lifecycle, ordering, cancellation, error, and budget semantics.
- A plugin may need a new generic SDK mechanism when existing events or registries cannot express its workflow; that change requires an SDK-focused ADR rather than a domain-specific core feature.
