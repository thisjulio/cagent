---
description: Core-specific architecture rules for changes under core.
paths:
  - "core/**/*.ts"
  - "core/**/*.tsx"
---

# Core rules

- Preserve UI -> controller -> domain -> SDK dependency direction.
- The core must not import from `plugins/*`.
- Keep logic modules free of UI dependencies.
- Respect the repository file, function, and parameter limits.
- Add focused tests for behavior changes and run `bun test`.