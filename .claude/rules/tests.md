---
description: Apply focused testing and architecture validation rules.
paths: ["core/test/**/*.ts", "sdk/test/**/*.ts", "plugins/*/test/**/*.ts"]
---

# Test rules

- Keep tests focused on one behavior or architectural constraint.
- Add regression coverage for changed behavior and contract changes.
- Preserve dependency-direction checks in `core/test/arch.test.ts`.
- Run the narrowest relevant test first, then run `bun test`.