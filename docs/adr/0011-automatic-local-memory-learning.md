# Automatic local memory learning

## Status

Accepted

## Decision

Local memory learning is fully automatic. Candidate memories extracted from completed turns and selected tool results are persisted as approved entries when they pass deterministic capture and sensitive-data masking rules.

The interactive UI does not show approval, edit, ignore, pending, or details controls for automatically learned entries. User input remains available at all times. Memory operations remain visible through the normal tool activity stream when the agent learns, updates, or forgets an entry.

Explicit memory maintenance commands may remain available for inspection, search, archival, and destructive forget operations, but automatic capture never blocks the workflow or creates pending suggestions in the UI.

## Consequences

- Automatic learning can affect later retrieval without an approval step.
- Sensitive content must still be masked or rejected before persistence.
- The canonical conversation history remains unchanged.
- The UI represents learning as ordinary tool activity rather than a review surface.
- Existing pending-review UI and interaction paths are removed from the automatic workflow.
