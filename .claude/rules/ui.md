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
- Read `docs/design-system/README.md` before significant UI work; follow its foundations, surface taxonomy, content, accessibility, and interaction contracts.
- Use semantic theme tokens and Design System primitives where appropriate. Do not add local hardcoded colors or responsive width thresholds.
- Define compact, standard, and wide behavior, including focus and keyboard behavior, for every significant surface.
- Reuse Picker, Inspector, or Blocking Prompt patterns instead of inventing an unreviewed panel pattern.
- Every visible keyboard shortcut must work in its active context and have interaction-test coverage.
- Run `bun run check:design-system`, relevant tests, typecheck, lint, and snapshots after UI changes.
