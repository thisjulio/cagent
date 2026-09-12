Validate release readiness without publishing.

1. Inspect the version and release scripts.
2. Check the working tree and generated artifacts.
3. Run `bun test`, architecture tests, and the configured build.
4. Verify the checksum generation path and release documentation.
5. Confirm that no secrets, debug output, or unintended files are included.

Report a checklist with exact commands and results. Stop on failures and do not tag, push, or publish.