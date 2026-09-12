---
description: Apply stable interface rules when editing SDK contracts.
paths: ["sdk/src/**/*.ts", "sdk/test/**/*.ts"]
---

# SDK rules

- Keep SDK interfaces provider- and tool-agnostic.
- Preserve compatibility for registered plugins.
- Add or update focused tests for contract changes.
- Run `bun test` and `bun run typecheck` after SDK changes.