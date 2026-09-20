# A plugin crash takes down the core (v1)

## Status

Accepted
There is no crash isolation in v1: each tool call is wrapped in try/catch in the core (cheap in JavaScript), but an unhandled crash inside a plugin (unhandled rejection, fatal error) takes down the process. Process isolation (IPC cost) and worker isolation (complexity) were rejected. Consequence: plugins are validated in tests before production use.
