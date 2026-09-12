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