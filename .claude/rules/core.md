---
description: Apply cagent architecture and quality rules when editing core code.
paths: ["core/src/**/*.ts", "core/src/**/*.tsx"]
---

# Core rules

- Preserve the dependency direction: UI -> controller -> domain -> SDK.
- Keep controllers and domain modules free of UI imports.
- Put OpenTUI components under `core/src/ui/components/`.
- Put pure rendering functions under `core/src/ui/render/`.
- Keep each file below 250 lines and each function below 40 lines.