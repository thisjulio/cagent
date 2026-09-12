# OpenTUI as the terminal UI engine

cagent uses `@opentui/core` with `@opentui/react` instead of Ink. This decision supersedes the Ink choice in ADR-0004 because OpenTUI keeps the Bun/TypeScript stack while providing a native renderer, focus, mouse, scrolling, textarea, select, and Markdown/code support; the accepted consequence is a dependency on the native binaries distributed by OpenTUI.
