# Hooks

cagent exposes a small native hook API through the SDK. Plugins register
`before_tool` hooks for policy decisions and `after_tool` hooks for auditing or
notifications.

The optional `@cagent/plugin-claude-hooks` adapter reads project and global
`.claude/settings.json` files. It currently supports Claude `PreToolUse` and
`PostToolUse` command hooks, including tool matchers. Hook commands receive a
Claude-shaped JSON payload on stdin.

Enable the adapter in `cagent.yml`:

```yaml
plugins:
  - name: claude-hooks
    path: ./plugins/claude-hooks
```

Hook failures or invalid output are non-blocking. A hook can return
`decision: "ask"` or `decision: "deny"` to affect a pre-tool operation.