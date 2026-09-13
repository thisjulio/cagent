# Command-line execution

`cagent` opens the interactive terminal UI when started without a prompt. Supply a prompt, stdin, or `--non-interactive` to run a task without the TUI.

```bash
cagent "Analyze this project"
cat task.md | cagent
cagent --file src/app.ts "Review this file"
cagent --output jsonl --yes "Run the task"
```

## Options

Run `cagent --help` for the complete list. Important options include `--session ID`, `--new-session`, `--permission-mode ask|auto|read-only`, `--yes`, `--output human|jsonl`, `--max-turns`, `--max-tool-calls`, and `--timeout`.

The current directory is the workspace. Files and directories supplied with `--file` and `--directory` are context hints for the agent. Human output follows the history message style; JSONL emits one event per line. Operational diagnostics belong on stderr.

## Exit codes

- `0`: successful execution
- `1`: agent or provider error
- `2`: invalid arguments
- `3`: permission denied
- `4`: provider or configuration unavailable
- `124`: timeout
- `130`: interrupted with SIGINT
- `143`: terminated with SIGTERM

The default permission mode is `ask`. Since headless execution cannot answer interactively, a requested permission is denied and the command explains how to use `--yes` or an explicit permission mode.
