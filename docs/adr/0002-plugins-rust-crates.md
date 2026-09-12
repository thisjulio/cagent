# Plugins = Rust crates only

Status: superseded by ADR-0004

Plugins were implemented as Rust crates, without a JavaScript runtime. The decision was reopened when the entire core migrated to Bun/TypeScript (ADR-0004): with the core in JavaScript, plugins are TypeScript packages in the same npm ecosystem, without FFI.
