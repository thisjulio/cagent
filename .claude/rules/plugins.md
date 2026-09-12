---
description: Apply plugin architecture and safety rules when editing plugins.
paths:
  - "plugins/**/*"
---

# Plugin rules

- Build every plugin on `@cagent/sdk`.
- Export registration from `src/index.ts`.
- Keep permission decisions in core; tools only define schemas and execution.
- Do not import plugins from core.
- Run the relevant plugin tests and `bun run lint` after plugin changes.