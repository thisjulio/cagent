# ADR-0014: Ordered turn state persistence

Status: Accepted

## Context

ADR-0008 keeps workflow-specific persistence in plugins and canonical session history in core. Filesystem checkpoints require a synchronous barrier before tools start and after they stop; fire-and-forget observations cannot provide that guarantee.

## Decision

The controller invokes the existing ordered EventBus waterfall as `turn.state`, with a versioned payload containing `sessionId`, `turnId`, and `data.phase` (`before` or `after`). Handlers are synchronous and must return the payload, optionally appending serializable records to `data.sessionMetadata`. Core persists these records as canonical session metadata without interpreting plugin-owned fields. Exceptions follow the existing plugin failure policy.

Registered commands receive optional session identity, active-turn status, canonical history, and an append-only metadata callback. They do not receive core implementation objects and cannot rewrite canonical history.

The code-tools plugin uses this mechanism for an isolated Shadow Git repository. It persists a pre-turn checkpoint and a completed-turn reference. `/undo` restores the workspace before the latest unrestored turn; `/rewind <turn>` restores before a positive, one-based user-turn number. Conversation history remains intact and restore metadata is append-only. A restore preflights all affected paths against the completed reference and refuses conflicting edits. Files outside the restore diff remain untouched.

No session fork API currently exists. Any future fork must copy canonical metadata with history so references remain tied to the fork's inherited turns; workspace restoration must remain explicit rather than silently following a conversation fork.

## Consequences

Plugins remain optional; core does not import tool plugins or interpret checkpoint hashes. Checkpoint metadata survives compaction because commands receive canonical history rather than the compacted model projection. Known secret filenames, ignored files, symlinks, `.git`, and `.cagent` are excluded. This filename policy is not a general-purpose secret-content detector.
