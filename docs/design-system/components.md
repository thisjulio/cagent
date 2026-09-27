# Component patterns

## Primitives

`Text`, `ShimmerText`, `DisclosureIndicator`, `Stack`, `Row`, `Divider`, `Surface`, `Panel`, `KeyHint`, `Status`, `Badge`, `Progress`, `Scrollable`, `SelectableList`, and `EmptyState` centralize repeated presentation choices. Prefer an existing primitive when it matches the semantics; keep product components responsible for arranging their content.

`ShimmerText` is a reusable text effect for active work. It uses semantic theme colors and follows the theme's reduced-motion preference; product components decide when the effect is appropriate. See [motion and effects](motion-effects.md) for its contract.

`DisclosureIndicator` standardizes the expanded/collapsed marker. It displays state only; the product component owns the toggle interaction and expanded content.

## Product surfaces

| Surface | Components | Contract |
| --- | --- | --- |
| Picker | `CommandPalette`, `ModelPicker`, `SessionList` | Compact, keyboard navigable, visible selection, useful empty state, Esc closes. |
| Inspector | `DiffPanel`, `SessionInfoPanel`, `LspPanel`, `ToolViewer` | Reading-first, scrollable, context-specific keys, Esc returns. |
| Blocking prompt | `PendingAsk`, `QuestionPanel` | Clear requested action, relevant context, only implemented actions advertised. |
| Conversation | `ChatViewport`, turn and tool components | Transcript dominates; reasoning and tool details are progressively disclosed. |

When changing a surface, document its states, keyboard and focus behavior, and compact/standard/wide behavior in its component or nearby tests.
