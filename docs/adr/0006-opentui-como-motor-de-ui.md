# OpenTUI como motor da terminal UI

O cagent usa `@opentui/core` com `@opentui/react` no lugar do Ink. A decisão supersede a escolha de Ink do ADR-0004 porque OpenTUI mantém o stack Bun/TypeScript, mas fornece renderer nativo, foco, mouse, scroll, textarea, select e Markdown/código; a consequência aceita é depender dos binários nativos distribuídos pelo OpenTUI.
