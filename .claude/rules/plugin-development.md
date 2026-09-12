---
description: Apply plugin boundary and registration rules when editing provider, tool, or integration plugins.
paths:
  - "plugins/**/*.ts"
  - "plugins/**/package.json"
  - "sdk/src/**/*.ts"
---

# Plugin development rules

- Every plugin depends on `@cagent/sdk` and registers through its plugin entry point.
- Plugins must not import core implementation modules.
- Providers implement the SDK provider lifecycle; tools expose schemas and `execute`.
- Compatibility adapters belong in plugins, while shared contracts belong in the SDK.
- Keep credentials out of repository configuration and tests.
- Add isolated tests for parsing and discovery behavior.