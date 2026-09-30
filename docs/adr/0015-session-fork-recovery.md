# ADR-0015: Consistent session forks and recoverable queue consumption

Status: Accepted

## Context

ADR-0014 requires forks to inherit canonical metadata and leaves workspace restoration explicit. Consuming a queued message before persisting its checkpoint can lose that message if the process stops between writes; exception compensation alone cannot handle process termination.

## Decision

`Session.fork()` creates a new session in the same directory from the active canonical projection, including pre-compaction history and opaque plugin metadata. Turn identifiers remain unchanged. A valid unfinished assistant snapshot is embedded in the fork log, making it independent of the source snapshot. A temporary file is synced and renamed before the fork is exposed. Forking does not restore workspace files.

New queued turns persist the checkpoint barrier first. The user record carries `queuedMessageId`, making user-message persistence and queue consumption a single log record. Recovery requeues messages without that committed record; historical completion and failure metadata remain supported. Queue and model selection are restored from the canonical projection rather than the compacted message window.

Canonical appends sync their file before returning. Readers preserve valid records preceding an incomplete final JSON fragment and reject malformed interior records. The next append removes that incomplete fragment before writing. These rules assume a single writer per session, as in the current controller.

## Consequences

Abrupt process termination before the user record does not discard the queued message. After the user record, recovery retains the interrupted conversation instead of submitting the same queue item twice. Rewinding before a queued user turn makes that item pending again. This contract does not automatically rerun tools, repair external plugin side effects, or guarantee durability against every filesystem or hardware failure.
