# Core = agent + UI

## Status

Accepted

The cagent core implements the agent loop (message → LLM → tool call → result), context management, session persistence, and the terminal UI (OpenTUI; see ADR-0004 and ADR-0006). Plugins implement only three categories: provider, tool, and integration. The minimal-core alternative (only UI + plugin host, with the loop itself as a plugin) was rejected: a core that owns the loop gives every plugin one predictable extension surface and keeps the runtime deterministic.
