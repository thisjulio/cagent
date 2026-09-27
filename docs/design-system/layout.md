# Application layout

`App` orders persistent regions as Header, Transcript, optional Task Strip, Composer, and Status. The header and status bar stay one row high. The transcript receives remaining height (`flexGrow`); tasks collapse when they do not need attention. The composer retains multiline editing and expands only as the terminal layout permits.

## Responsive behavior

Use `responsiveSize(width)` and `isSplitCapable(width)` from `core/src/ui/theme/breakpoints.ts`.

| Mode | Width | Behavior |
| --- | ---: | --- |
| Compact | <60 | Keep primary meaning and actions; remove secondary metadata first. |
| Standard | 60–119 | Show normal labels and useful secondary context. |
| Wide | >=120 | Restore secondary metadata and progress details. |
| Split-capable | >=140 | Diff inspectors may use a split view. |

Preserve paths and titles before metadata. Truncate primary content only when other details have already been removed.
