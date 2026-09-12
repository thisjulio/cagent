---
description: Apply core architecture constraints when editing core domain, controller, registry, loop, or SDK code.
paths:
  - "core/src/**/*.ts"
  - "sdk/src/**/*.ts"
  - "core/test/arch.test.ts"
---

# Core architecture rules

- Preserve the dependency direction: UI -> controller -> domain -> SDK.
- The core must not import from `plugins/*`; use SDK interfaces and dependency injection.
- Keep logic modules free of UI dependencies.
- Add new behavior through registries or registered sources instead of growing conditionals.
- Keep each file to one responsibility and respect the repository module limits.
- Update focused tests when changing behavior, then run `bun test`.