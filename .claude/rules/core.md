---
description: Apply cagent architecture and quality rules when editing core code.
paths:
  - "core/**/*"
---

# Core rules

- Preserve the dependency direction: UI -> controller -> domain -> SDK.
- Keep controllers and domain modules free of UI imports.
- Put OpenTUI components under `core/src/ui/components/`.
- Put pure rendering functions under `core/src/ui/render/`.
- Run `bun test` and `bun run typecheck` after core changes.