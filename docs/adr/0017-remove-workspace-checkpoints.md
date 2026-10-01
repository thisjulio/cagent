# ADR-0017: Remove workspace rollback and Shadow Git

Status: Accepted

## Context

The code-tools plugin previously created complete workspace snapshots before and
after each turn in an isolated Shadow Git repository. This imposed file
enumeration and content hashing costs even when the agent did not touch most
files. Workspace `/undo` and `/rewind` commands also coupled conversation
history restoration to filesystem rollback.

## Decision

Remove the code-tools `/undo` and `/rewind` commands, workspace rollback, and
the Shadow Git implementation and storage for this workspace.

Generic conversation-history restoration remains available through the
existing session APIs, independently of slash commands and filesystem rollback.
The generic `turn.state` workflow event remains available for plugin-owned
persistence and is not a workspace snapshot mechanism.

Existing Shadow Git data is not automatically removed by the application.
Users may remove `.cagent/.shadow/` from other workspaces after upgrading.

## Consequences

The cagent slash-command interface no longer offers `/undo` or `/rewind`.
Agent edits cannot be rolled back through cagent; users can use their regular
version-control tools to recover file changes. Prompt handling no longer incurs
Shadow Git workspace scans or commits.
