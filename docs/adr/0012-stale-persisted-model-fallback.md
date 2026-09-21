# Stale persisted model fallback

## Status

Accepted

## Decision

The model stored in `last-model.json` is an advisory UI selection, not an explicit configuration requirement. At startup, if its provider catalog no longer contains the persisted route, cagent clears the stale choice and resolves the configured model or the normal first-provider fallback; an explicit `model:` route remains strict and still fails when invalid.

## Consequences

- Changing or removing a local model no longer prevents cagent from starting because of stale UI state.
- A persisted route is checked against the provider catalog before it overrides project or global configuration.
- Provider catalog network failures keep the persisted route temporarily, preserving the existing offline behavior.
