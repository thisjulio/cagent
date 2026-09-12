#!/usr/bin/env bash
set -euo pipefail

input=$(cat)
command=$(printf '%s' "$input" | sed -n 's/.*"command"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')

case "$command" in
  *"rm -rf"*|*"git reset --hard"*|*"git clean -fd"*)
    printf '%s\n' '{"decision":"ask","reason":"Destructive command requires explicit approval."}'
    ;;
  *)
    printf '%s\n' '{"decision":"allow"}'
    ;;
esac
