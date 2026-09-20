# Core and plugins in Bun/TypeScript

## Status

Accepted
The core (agent loop, context, sessions, UI) and all plugins are implemented in TypeScript on Bun. The UI uses OpenTUI; ratatui was rejected because it has no JavaScript equivalent and the trade-off favored development speed and the npm ecosystem. Plugins are TypeScript packages loaded through dynamic import; no Rust, FFI, or cdylib.
