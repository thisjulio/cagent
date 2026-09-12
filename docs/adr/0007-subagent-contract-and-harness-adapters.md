# Native subagents and harness adapters

## Status

Accepted

## Context

cagent supports providers and tools through the SDK plugin contract, but it has no
portable representation for a specialized agent. Claude Code and other coding
harnesses commonly describe specialized agents as Markdown files with YAML
frontmatter. Those files are useful interoperability inputs, but their discovery
rules and runtime capabilities are harness-specific.

We need native subagents without making the core depend on Claude Code, Cursor, or
Codex conventions. We also want optional plugins that import supported external
agent files, including Claude agent files and Codex agent files when their format
is available.

## Decision

cagent defines a neutral subagent definition in the SDK:

```ts
export type SubagentDefinition = {
  name: string;
  description: string;
  instructions: string;
  model?: string;
  tools?: string[];
};
```

The `name` is a stable kebab-case identifier. `description` is required metadata
for discovery and selection. `instructions` is the agent's Markdown prompt. The
optional `model` is a model route or the configured default, and `tools` is an
allowlist of canonical tool names. External formats are translated into this
contract before registration.

Subagents are registered through `PluginContext`, like tools and providers. The
core owns the registry, discovery, execution, context, and permission pipeline;
subagent plugins only parse or translate definitions. The core must not import a
Claude, Cursor, or Codex integration.

The native project format is `agents/*.md`. Native files use YAML frontmatter
with `name`, `description`, optional `model`, and optional `tools`, followed by
Markdown instructions. The core may discover these files directly. Harness
adapters may additionally discover their own conventional roots, such as
`.claude/agents/*.md`, and register translated definitions. Adapters are
optional plugins and do not make an external format the cagent canonical format.

A subagent execution receives a task and caller context, uses the selected
provider and allowlisted tools, and returns a result through the core's existing
session and event abstractions. External agent files are never treated as
executable code merely because they were discovered.

## Consequences

- Native subagents are portable and testable without a provider or UI.
- Claude and Codex compatibility can evolve independently as plugins.
- The core remains independent of external harness terminology and file layouts.
- A plugin must define how external metadata maps to the neutral contract and
  must reject unsupported or ambiguous fields rather than silently guessing.
- Runtime delegation is a separate implementation step from file parsing and
  registration.
