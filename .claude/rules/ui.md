---
description: Apply terminal UI layout and interaction rules.
paths: ["core/src/ui/**/*.tsx", "core/src/ui/**/*.ts", "core/scripts/**/*.tsx"]
---

# UI rules

- Keep React components responsible for layout and formatting only.
- Keep I/O, business rules, and state mutation out of components.
- Before implementing a new screen, provide an 80-column ASCII wireframe for approval.
- After UI changes, run `bun core/scripts/snap.tsx` and compare the 60, 80, and 120-column snapshots.
- Capture focus and navigation states in UI tests.