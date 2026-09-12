Perform an architecture compliance audit for the requested scope.

Read `AGENTS.md`, `CONTEXT.md`, `docs/adr/`, and `core/test/arch.test.ts`. Use `graphify query` or `graphify path` before broad searches. Trace imports from UI to controller to domain to SDK and confirm that the core does not import plugins.

Check registries, extension points, module responsibilities, dependency injection, and file/function limits. Run the architecture test and report concrete violations with evidence.

Scope: $ARGUMENTS