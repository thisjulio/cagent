# Governance

Before changing UI, search for an existing semantic token, primitive, surface pattern, and interaction. Extend the shared pattern when the need recurs; keep local styling only for real component-specific semantics.

For each significant UI change:

1. Define compact, standard, and wide behavior plus focus and keyboard behavior.
2. Reuse semantic tokens and primitives; do not add local hex colors or width thresholds.
3. Add interaction tests for visible shortcuts and relevant focus/navigation states.
4. Run `bun core/scripts/snap.tsx` and inspect the 60-, 80-, and 120-column output.
5. Run `bun run check:design-system`, typecheck, lint, and relevant tests.

New screens still require an 80-column wireframe review as required by `.claude/rules/ui.md`. Update these docs when implemented behavior or shared patterns change.
