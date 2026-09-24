# Context extension assembly

## Status

Accepted

## Context

The SDK already lets plugins register generic context extensions, but the core did not invoke them while assembling provider requests. Static prompt sections cannot represent context that changes during a session. Extensions also need bounded execution and a global token budget.

Some context is stable across ordinary turns and should remain in the reusable prompt prefix. Other contributions depend on the current user query and belong near the end of the request. Core behavior must not depend on a plugin's domain.

## Decision

The core evaluates registered context extensions before each turn, after any automatic compaction for the turn. It supports two generic phases:

- `stable`: evaluated once per session and cached by extension ID; included before the conversation messages and reused on later turns;
- `turn`: evaluated for each submitted user message and included immediately before the conversation messages.

The core orders extensions by phase, priority, and ID, gives them a shared configurable token budget (`context_extension_tokens`, default 2000), and estimates missing token counts at four characters per token. Each call has a 250 ms timeout. A timeout or extension failure is recorded and does not abort the turn. Contributions are request-only and do not enter canonical session history.

Stable contributions are evaluated after the turn's automatic compaction. New and restored sessions naturally rebuild their cache. Plugins may use ordinary lifecycle events to invalidate their own source data; cached stable text is intentionally refreshed at the next prefix-breaking session boundary, not on every write.

## Consequences

- Generic plugin context now reaches provider requests without adding domain-specific concepts to the core.
- Stable contributions can be reused across turns, preserving a stable prefix; query-dependent contributions remain near the user message.
- The budget and timeout bound plugin impact, while failures remain non-fatal.
- A session-local stable cache is conservative: changes only appear after starting or restoring a session, or another explicit prefix rebuild.
- Token estimates are approximate because the core does not own provider tokenizers.