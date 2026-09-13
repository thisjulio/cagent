# Cross-cutting observability

## Status

Accepted

## Context

cagent needs consistent performance and reliability signals across the Core, providers, tools, UI, and plugins. Observability is platform infrastructure: it must see startup and plugin loading, remain available when optional capabilities fail, and correlate work across a session and turn.

OpenTelemetry is a useful ecosystem and export format, but making it a required runtime dependency would couple the product to a vendor API, a collector, and potentially a network. cagent also supports local-first and offline operation.

## Decision

Observability is a cross-cutting platform capability, not a domain plugin. The SDK defines a vendor-neutral `Observability` contract. The Core owns the active implementation and injects it into plugin contexts. Plugins and providers instrument their work through that contract and do not import OpenTelemetry directly.

The default implementation is no-op. Export is opt-in and must not create implicit network activity. Future exporters may target local files, console output, or OpenTelemetry/OTLP through an adapter. Development benchmarks may use an in-memory implementation and OS/runtime measurements without exporting telemetry.

Instrumentation must avoid content and secrets by default. Attributes are bounded metadata such as operation names, counts, durations, statuses, provider/model identifiers where safe, and fallback flags. Prompts, responses, memory contents, tool output, credentials, embeddings, and file contents are not telemetry attributes.

Observability failures must never block the agent workflow. The Core and plugins must tolerate absent, disabled, or failing exporters.

## Consequences

- Startup, plugin loading, provider calls, tools, and domain plugins can share correlation without a plugin-specific telemetry dependency.
- A future OpenTelemetry adapter can be added without changing domain code.
- The platform carries a small always-available abstraction and a no-op default.
- CPU, RSS, I/O, and profiler data remain benchmark/runtime concerns rather than being promised by the SDK contract.
- Export configuration and redaction require explicit product policy before remote telemetry is enabled.
