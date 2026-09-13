# Observability and performance measurements

## Platform capability

Observability is cross-cutting platform infrastructure, not a regular domain plugin. The SDK exposes a vendor-neutral contract and the Core owns the active implementation. The Core injects the same implementation into every `PluginContext`, so startup, plugin loading, providers, tools, and domain plugins can share correlation.

The contract has no OpenTelemetry dependency and defaults to no-op behavior. Normal runtime therefore does not require a collector or network. An OpenTelemetry/OTLP adapter may be added later without changing Core or plugin code.

## Contract

```ts
interface Observability {
  startSpan(name: string, attributes?: Attributes): Span;
  recordMetric(name: string, value: number, attributes?: Attributes): void;
  recordEvent(name: string, attributes?: Attributes): void;
}
```

Bootstrap and tests may inject an implementation. Plugin authors use `ctx.observability`; they do not import an exporter or vendor API.

## Instrumentation boundaries

Instrument workflow boundaries rather than private implementation details:

- `session.start`, `message.submit`, `prompt.assemble`, `context.extension`;
- `tool.execute`, `turn.complete`, `session.compact`;
- `provider.prepare`, `provider.request`, `provider.first_token`, `provider.complete`;
- plugin operations such as `plugin.load`, `memory.retrieval`, `memory.embedding`, and `memory.capture`.

The current Core flow records `plugin.load`, `agent.turn`, `provider.prepare_call`,
`provider.stream`, `tool.execute`, `provider.error`, `agent.turn.error`, and
`agent.turn.elapsed_ms`. Provider stream spans include chunk count, output character
count, and time to the first received chunk. Attributes are intentionally metadata
only; they do not contain request or response content.

Use bounded metadata such as plugin name, provider name, model route, result counts, token counts, statuses, and fallback flags. Do not record prompts, responses, memory contents, tool output, embeddings, credentials, or file contents.

## Export policy

The default exporter is no-op. Export is opt-in and must not create implicit network activity. Future exporters may target local files, console output, or OpenTelemetry/OTLP through an adapter. Observability failures must never block the agent workflow.

## Local JSONL exporter

Local analysis can be enabled in `~/.cagent/config.yml` or `cagent.yml`:

```yaml
observability:
  enabled: true
  file: ~/.cagent/telemetry/events.jsonl
```

When `file` is omitted, records are appended to:

```text
~/.cagent/telemetry/events.jsonl
```

Each line is one JSON object with `type` (`span`, `metric`, or `event`), an ISO timestamp, and bounded attributes. The directory is created with mode `0700` and the file with mode `0600`. File-write failures are swallowed so telemetry cannot block cagent. Do not enable this file exporter when untrusted users can read the configured path.

## Benchmark helper

`core/src/benchmark.ts` provides `benchmark(name, operation, attributes)`. It captures wall-clock duration, RSS before/after, process user/system CPU time when available, Linux `/proc/self/io` read/write bytes when available, and in-memory spans/metrics.

## Comparison scenarios

Use a stable fake provider and fixed inputs to compare:

1. Core without observability or memory;
2. plugin loaded but idle;
3. lexical retrieval;
4. semantic embedding and vector retrieval;
5. hybrid ranking;
6. automatic capture;
7. missing-model lexical fallback.

Report repeated runs with the same Bun version, OS, hardware, dataset, and warm/cold state. Keep baseline results outside source code until a benchmark command and artifact format are agreed.
