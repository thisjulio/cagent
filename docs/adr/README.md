# Architecture decisions

Each ADR records one architectural decision. Every document has a status:

- **Accepted**: active decision that current code should follow.
- **Superseded**: retained for history, but replaced by a later ADR.

Current decision chain:

- ADR-0002 is **Superseded** by ADR-0004 (the project uses TypeScript plugins, not Rust crates).
- ADR-0011 refines the automatic-learning behavior described by ADR-0009; where they conflict, ADR-0011 is authoritative.
- ADR-0013 defines bounded assembly for generic context extensions.
- The remaining ADRs are **Accepted** unless a later ADR explicitly supersedes them.

When changing an active decision, add a new ADR instead of silently editing the old rationale.
