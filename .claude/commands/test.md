Run the repository verification workflow.

1. Read `AGENTS.md`, `CONTEXT.md`, and active ADRs relevant to the changes.
2. Run the narrowest relevant tests first, then run `bun test`.
3. Run `bunx biome check` on every touched source, test, and configuration file.
4. If the change affects architecture, run the architecture test explicitly.
5. Report each command, pass/fail result, and actionable failure summary.

Do not claim success without command output. Do not modify files unless the user asks.

User focus: $ARGUMENTS