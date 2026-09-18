# Hooks

cagent exposes a small native hook API through the SDK. Plugins register
hooks at different phases of the agent lifecycle.

## Hook phases

- `before_tool` — before a tool executes (can allow, ask, or deny)
- `after_tool` — after a tool completes (auditing, notifications)
- `session_start` — when a session begins
- `user_prompt_submit` — when a user submits a prompt, before LLM processing
- `subagent_start` — when a subagent is about to be invoked

## Claude hooks adapter

The optional `@cagent/plugin-claude-hooks` adapter reads project and global
`.claude/settings.json` files. It maps Claude hook events to cagent phases:

| Claude event | cagent phase |
|---|---|
| `PreToolUse` | `before_tool` |
| `PostToolUse` | `after_tool` |
| `SessionStart` | `session_start` |
| `UserPromptSubmit` | `user_prompt_submit` |
| `SubagentStart` | `subagent_start` |

Tool hooks support Claude tool matchers. Hook commands receive a Claude-shaped
JSON payload on stdin.

### Environment variable expansion

Hook commands support `${VAR}` expansion for these variables:

- `${PLUGIN_ROOT}` — absolute path to the claude-hooks plugin directory
- `${CWD}` — current working directory
- `${HOME}` — user's home directory

Example:

```json
{ "hooks": { "PreToolUse": [{ "matcher": "Bash", "hooks": [{ "type": "command", "command": "echo ${PLUGIN_ROOT}" }] }] } }
```

Enable the adapter in `cagent.yml`:

```yaml
plugins:
  - name: claude-hooks
    path: ./plugins/claude-hooks
```

Hook failures or invalid output are non-blocking. A hook can return
`decision: "ask"` or `decision: "deny"` to affect a pre-tool operation.
