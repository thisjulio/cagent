# ADR-0014: Ordered turn state persistence

Status: Accepted

## Context

ADR-0008 keeps workflow-specific persistence in plugins and canonical session history in core. Filesystem checkpoints require a synchronous barrier before tools start and after they stop; fire-and-forget observations cannot provide that guarantee.

## Decision

The controller invokes the existing ordered EventBus waterfall as `turn.state`, with a versioned payload containing `sessionId`, `turnId`, and `data.phase` (`before` or `after`). Handlers are synchronous and must return the payload, optionally appending serializable records to `data.sessionMetadata`. Core persists these records as canonical session metadata without interpreting plugin-owned fields. Exceptions follow the existing plugin failure policy. This generic event remains available for plugin-owned persistence.

Registered commands receive optional session identity, active-turn status, canonical history, and an append-only metadata callback. They do not receive core implementation objects and cannot rewrite canonical history.

The code-tools plugin previously used this mechanism for Shadow Git workspace checkpoints and `/undo` and `/rewind` file restoration. That workflow is removed by ADR-0017. Conversation-history restoration is separate and remains available.

No session fork API currently exists. Any future fork must copy canonical metadata with history so references remain tied to the fork's inherited turns; workspace restoration must remain explicit rather than silently following a conversation fork.

## Consequences

Plugins remain optional; core does not import tool plugins or interpret plugin-owned metadata.
