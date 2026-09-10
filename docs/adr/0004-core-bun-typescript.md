# Core e plugins em Bun/TypeScript

Core (loop de agente, contexto, sessões, UI) e todos os plugins são implementados em TypeScript sobre Bun. A UI usa ink; ratatui foi rejeitado — não tem equivalente em JS e o trade-off favoreceu velocidade de desenvolvimento + ecossistema npm. Plugins são packages TS carregados via dynamic import; sem Rust, sem FFI, sem cdylib.
