# cagent Design System

The Design System is the shared contract for terminal-native UI in cagent. It prioritizes information density, predictable keyboard behavior, visible state, and respect for the terminal environment.

## Layers

1. Foundations in `core/src/ui/theme/`: primitive palette, semantic themes, spacing, typography roles, symbols, breakpoints, motion preference, and terminal runtime theme subscription.
2. Primitives in `core/src/ui/primitives/`: `Text`, `ShimmerText`, `Stack`, `Row`, `Divider`, `Surface`, `Panel`, `KeyHint`, `Status`, `Badge`, `Progress`, `Scrollable`, `SelectableList`, and `EmptyState`.
3. Product components in `core/src/ui/components/` compose these primitives and own presentation, not domain logic.
4. Application surfaces are organized as a one-row header, transcript, optional context strip, composer, and one-row status bar.

## Quick start

Use `useTheme()` and semantic tokens for colors, `Text` for text roles, and `symbols` for state markers. Use `responsiveSize(width)` rather than local width thresholds. `Esc` closes/cancels the active surface; Enter confirms/submits; arrows navigate the focused surface first.

```tsx
const { color } = useTheme();
<Text tone="warning" bold>{symbols.warning} Configuration needs attention</Text>
```

Read [principles](principles.md), [foundations](foundations.md), [motion and effects](motion-effects.md), [layout](layout.md), [components](components.md), [interaction](interaction.md), [content](content.md), [accessibility](accessibility.md), and [governance](governance.md) before making a significant UI change.

## Product surfaces

- **Picker:** Command Palette, Model Picker, and Session Picker. Keep selection visible, support keyboard navigation, show empty results, and close with `Esc`.
- **Inspector:** Diff, Usage, Telemetry, and LSP. Optimize for reading and paging; `Esc` returns to the conversation.
- **Blocking prompt:** permission and question prompts. Show only actions handled by the active controller path, and make the result of `Esc` explicit.

## Application layout

`App` keeps a one-row header and status bar around the transcript. Tasks collapse to a single summary row; the composer grows for multiline input. The terminal owns the background color. Read [layout](layout.md) for region behavior and compact-mode priorities.
