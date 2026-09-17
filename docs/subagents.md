# Subagents

cagent has a native subagent runtime in the core. The built-in `general` subagent is
embedded in the core and is always registered during bootstrap. Additional native
definitions are Markdown files under `agents/` and are discovered during bootstrap.

```md
---
name: architecture-reviewer
description: Review architecture boundaries.
model: openai/gpt-5
tools:
  - search
  - read_file
---

Review the requested change and return concrete findings.
```

The main agent invokes a registered subagent through the `subagent` tool. The
child receives isolated system instructions and task messages. Its tools are
restricted by `tools` and still pass through the normal permission pipeline.
The child cannot invoke `subagent` recursively.

`model` is a model route. If it includes a provider prefix, such as
`openai/gpt-5`, the core resolves that provider from the registry. Without a
prefix, the active provider is used.

## External harness adapters

Enable the optional Claude adapter to import `.claude/agents/*.md`:

```yaml
plugins:
  - name: claude-agents
    path: ./plugins/claude-agents
```

Enable the Codex adapter similarly for `.codex/agents/*.md`:

```yaml
plugins:
  - name: codex-agents
    path: ./plugins/codex-agents
```

Both adapters translate external Markdown files into the native
`SubagentDefinition` contract. They do not execute files as code.
