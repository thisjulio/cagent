---
description: Plugin-specific rules for provider, tool, and compatibility changes.
paths:
  - "plugins/**/*"
  - "sdk/**/*"
---

# Plugin rules

- Plugins depend on the SDK and must not import core implementation modules.
- Register providers, tools, and compatibility sources through the plugin context.
- Keep credentials out of source, configuration, and tests.
- Add isolated tests for discovery, parsing, and registration behavior.

## Package metadata

- Publishable runtime plugins use the `@cagent/plugin-*` name, include a semantic `version`, and are not private.
- Repository-only compatibility adapters remain `private: true`; their historical names may be retained when referenced by project configuration.
- Every plugin uses `type: module`, `main: src/index.ts`, and depends on `@cagent/sdk: workspace:*`.
- Run `bun run check:plugins` after changing a plugin manifest.
