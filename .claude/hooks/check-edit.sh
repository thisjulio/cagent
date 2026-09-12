#!/usr/bin/env bash
set -euo pipefail

input=$(cat)
file=$(printf '%s' "$input" | sed -n 's/.*"file_path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')

if [[ -n "$file" && "$file" == *.ts* ]]; then
  printf '%s\n' '{"continue":true,"message":"TypeScript edit recorded; run bun run typecheck before finishing."}'
else
  printf '%s\n' '{"continue":true}'
fi
