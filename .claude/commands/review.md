Review the current working tree as a strict architectural code review.

Inspect `git diff`, `git status`, `AGENTS.md`, `CONTEXT.md`, and all active ADRs. Check:

- dependency direction and plugin boundaries;
- one responsibility per file;
- 500-line file, 40-line function, and four-parameter limits;
- forbidden filenames and misplaced code;
- tests for changed behavior;
- English repository artifacts;
- security, permission, and error-handling risks.

Return findings ordered by severity with file and line references. Separate confirmed violations from suggestions. If there are no findings, say what was verified and identify remaining uncertainty.

Review focus: $ARGUMENTS