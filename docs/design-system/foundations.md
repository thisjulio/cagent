# Foundations

`core/src/ui/theme/palette.ts` is the raw palette and may contain color literals. Application components use `themes` from `themes.ts` through `useTheme()` and consume semantic `color` roles, not palette entries.

Semantic roles cover accent, text hierarchy, success/warning/danger/info, disabled state, borders, and surfaces. Dark and light themes preserve a transparent base so the terminal background remains visible. OpenTUI `theme_mode` selects the semantic theme; `palette` changes are observed and retained by the provider for future use without replacing semantic contrast choices.

Use the shared `symbols` map for status and task markers. `space` uses terminal cells (`0, 1, 2, 3, 4`), and `typography` names text roles rather than prescribing web-style sizes. Motion is `normal` or `reduced`; active spinner animation is disabled in reduced mode.

`responsiveSize(width)` defines compact below 60 columns, standard from 60 through 119, and wide from 120. `supportsSplit(width)` is true at 140 columns. Components drop metadata before shortening primary content.
# Foundations

The public component API uses `ThemeTokens` from `core/src/ui/theme/types.ts`.

- **Palette:** raw color values live in `palette.ts`; product components consume semantic `color.*` roles.
- **Themes:** `themes.ts` maps semantic colors for dark and light terminal modes and leaves the terminal background transparent.
- **Runtime:** `App` follows OpenTUI `theme_mode` and terminal palette events. A reported terminal foreground becomes primary text; the terminal background remains transparent.
- **Symbols:** `symbols.ts` owns state markers; use text labels with them for important states.
- **Spacing and type:** `spacing.ts` and `typography.ts` define terminal-cell spacing and semantic text roles.
- **Breakpoints:** `responsiveSize(width)` maps widths to compact (<60), standard (60–119), and wide (>=120); split diff layout begins at 140 columns.

Use `Text` for roles, `Status` for state, and `Panel` for picker, inspector, and blocking-prompt framing. Primitives stay deliberately small; compose them rather than adding surface-specific variants without a demonstrated need.
