# Plugins = apenas crates Rust

Status: superseded by ADR-0004

Plugins eram implementados como crates Rust, sem runtime JavaScript. A decisão foi reaberta quando o core inteiro migrou para Bun/TypeScript (ADR-0004): com o core em JS, os plugins são packages TS no mesmo ecossistema npm, sem FFI.
